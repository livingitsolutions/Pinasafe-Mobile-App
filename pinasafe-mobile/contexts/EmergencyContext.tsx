// // Example organization mapping for emergencies
// import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// import { apiService } from '@/services/apiService';
// import { EmergencyEvidence, ClassificationResult } from '@/services/AIClassificationService';
// import { organizationAlertService, AlertDispatch } from '@/services/organizationAlertService';
// import { incidentClusteringService, ClusteredIncident } from '@/hooks/incidentClusteringService';
// import { reactNativeAudioAlertService } from '@/services/ReactNativeAudioAlertService';
// import { useAuth } from './AuthContext';

// export interface EmergencyReport {
//   id: string;
//   type: string;
//   description: string;
//   location: string;
//   coordinates?: { latitude: number; longitude: number };
//   contactNumber?: string;
//   status: 'pending' | 'dispatched' | 'responding' | 'resolved';
//   priority: 'low' | 'medium' | 'high' | 'critical';
//   reportedBy: string;
//   reportedAt: string;
//   responderId?: string;
//   resolvedAt?: string;
//   notes?: string;
//   evidence?: EmergencyEvidence;
//   aiClassification?: ClassificationResult;
//   useAIClassification?: boolean;
//   dispatches?: AlertDispatch[];
// }

// export interface EmergencyCall {
//   id: string;
//   service: string;
//   number: string;
//   date: string;
//   time: string;
//   duration: string;
//   status: 'completed' | 'missed' | 'busy';
//   location: string;
//   outcome: string;
//   userId: string;
// }

// export interface Alert {
//   id: string;
//   type: 'weather' | 'emergency' | 'community' | 'system';
//   title: string;
//   description: string;
//   priority: 'low' | 'medium' | 'high' | 'critical';
//   location: string;
//   issuedAt: string;
//   expiresAt?: string;
//   isActive: boolean;
//   affectedAreas: string[];
// }

// interface EmergencyContextType {
//   // Reports
//   reports: EmergencyReport[];
//   clusteredIncidents: ClusteredIncident[];
//   submitReport: (report: Omit<EmergencyReport, 'id' | 'reportedAt' | 'status'>) => Promise<string>;
//   updateReportStatus: (reportId: string, status: EmergencyReport['status'], notes?: string) => Promise<void>;
//   getReportsByUser: (userId: string) => EmergencyReport[];
//   getClusteredIncidents: () => ClusteredIncident[];
//   getClusterStatistics: () => any;
  
//   // Calls
//   calls: EmergencyCall[];
//   logCall: (call: Omit<EmergencyCall, 'id'>) => Promise<void>;
//   getCallsByUser: (userId: string) => EmergencyCall[];
  
//   // Alerts
//   alerts: Alert[];
//   createAlert: (alert: Omit<Alert, 'id' | 'issuedAt' | 'isActive'>) => Promise<void>;
//   dismissAlert: (alertId: string) => Promise<void>;
//   getActiveAlerts: () => Alert[];
  
//   // Responder Alerts
//   alertResponders: (reportId: string, alertData: {
//     type: string;
//     location: string;
//     coordinates?: { latitude: number; longitude: number };
//     priority: string;
//     description: string;
//     hasEvidence: boolean;
//     aiClassified: boolean;
//     aiConfidence?: number;
//   }) => Promise<void>;
  
//   // Statistics
//   getEmergencyStats: () => {
//     totalReports: number;
//     activeIncidents: number;
//     resolvedToday: number;
//     averageResponseTime: string;
//   };
// }

// const EmergencyContext = createContext<EmergencyContextType | undefined>(undefined);



// export function EmergencyProvider({ children }: { children: React.ReactNode }) {
//   const [reports, setReports] = useState<EmergencyReport[]>([]);
//   const [clusteredIncidents, setClusteredIncidents] = useState<ClusteredIncident[]>([]);
//   const [calls, setCalls] = useState<EmergencyCall[]>([]);
//   const [alerts, setAlerts] = useState<Alert[]>([]);
//   const { authToken, user } = useAuth();
  

//   useEffect(() => {
//     if (authToken) {
//       initializeData();

//       const pollInterval = setInterval(() => {
//         loadReports();
//         loadAlerts();
//       }, 10000);

//       return () => clearInterval(pollInterval);
//     }
//   }, [authToken, initializeData, loadReports, loadAlerts]);

//   // useEffect(() => {
//   //   // Update clustered incidents whenever reports change
//   //   const clusters = incidentClusteringService.clusterIncidents(reports);
//   //   console.log('Updated clustered incidents:', clusters);
//   //   console.log('Current reports:', reports);
//   //   setClusteredIncidents(clusters);

//   //   // Manage continuous audio alerts for pending reports
//   //   reports.forEach(report => {
//   //     if (report.status === 'pending') {
//   //       reactNativeAudioAlertService.startContinuousAlert(
//   //         report.id,
//   //         report.type,
//   //         report.priority,
//   //         report.location || 'Unknown location',
//   //         report.description
//   //       );
//   //     } else if (report.status === 'dispatched' || report.status === 'responding' || report.status === 'resolved') {
//   //       reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
//   //     }
//   //   });

//   // }, [reports]);

//   useEffect(() => {
//     const clusters = incidentClusteringService.clusterIncidents(reports);
//     setClusteredIncidents(clusters);

//     // ✅ Only responders/admins should hear alerts
//     if (!user || !['responder', 'admin'].includes(user.role)) {
//       // Stop all alerts for citizens just in case
//       reports.forEach(report => {
//         reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
//       });
//       return;
//     }

//     // ✅ Audio alerts ONLY for responders/admins
//     reports.forEach(report => {
//       if (report.status === 'pending') {
//         reactNativeAudioAlertService.startContinuousAlert(
//           report.id,
//           report.type,
//           report.priority,
//           report.location || 'Unknown location',
//           report.description
//         );
//       } else {
//         reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
//       }
//     });

//   }, [reports, user]);

//   const loadReports = useCallback(async () => {
//     try {
//       const filters: any = {};

//       if (user && (user.role === 'responder' || user.role === 'admin') && user.organizationId) {
//         filters.organizationId = user.organizationId;
//       }

//       const response: any = await apiService.getEmergencyReports(filters);

//       console.log('Loaded reports:', response.data);

//       if (response?.data?.data) {
//         // Convert latitude/longitude strings to numbers for clustering
//         const normalized = response.data.data.map((r: any) => ({
//           ...r,
//           coordinates: r.latitude && r.longitude
//             ? {
//                 latitude: parseFloat(r.latitude),
//                 longitude: parseFloat(r.longitude),
//               }
//             : undefined,
//         }));

//         setReports(normalized);
//       } else {
//         setReports([]);
//       }
//     } catch (error) {
//       console.error('Error loading reports:', error);
//     }
//   }, [user]);

//   const loadAlerts = useCallback(async () => {
//     try {
//       const response = await apiService.getActiveAlerts();
//       if (response.data) {
//         setAlerts(Array.isArray(response.data) ? response.data : []);
//       }
//     } catch (error) {
//       console.error('Error loading alerts:', error);
//     }
//   }, []);

//   const initializeData = useCallback(async () => {
//     try {
//       // Load initial data from database
//       await loadReports();
//       await loadAlerts();
//     } catch (error) {
//       console.error('Error initializing emergency data:', error);
//     }
//   }, [loadReports, loadAlerts]);

//   const submitReport = async (reportData: Omit<EmergencyReport, 'id' | 'reportedAt' | 'status'>): Promise<string> => {
//     try {
//       const response = await apiService.createEmergencyReport({
//         type: reportData.type as any,
//         description: reportData.description,
//         location: reportData.location,
//         coordinates: reportData.coordinates,
//         contactNumber: reportData.contactNumber,
//         priority: reportData.priority,
//         evidence: reportData.evidence,
//         aiClassification: reportData.aiClassification,
//         useAIClassification: reportData.useAIClassification,
//       });

//       if (response.error) {
//         throw new Error(response.error);
//       }

//       // Reload reports to get updated data
//       await loadReports();
      
//       return response.data?.id || '';
//     } catch (error) {
//       console.error('Error submitting report:', error);
//       throw error;
//     }
//   };

//   const updateReportStatus = async (reportId: string, status: EmergencyReport['status'], notes?: string) => {
//     try {
//       const response = await apiService.updateEmergencyReportStatus(reportId, status, notes);
      
//       if (response.error) {
//         throw new Error(response.error);
//       }
      
//       // Reload reports to get updated data
//       await loadReports();
//     } catch (error) {
//       console.error('Error updating report status:', error);
//       throw error;
//     }
//   };

//   const logCall = async (callData: Omit<EmergencyCall, 'id'>) => {
//     try {
//       const response = await apiService.logEmergencyCall({
//         serviceName: callData.service,
//         serviceNumber: callData.number,
//         callDate: callData.date,
//         callTime: callData.time,
//         duration: callData.duration,
//         status: callData.status,
//         location: callData.location,
//         outcome: callData.outcome,
//       });
      
//       if (response.error) {
//         throw new Error(response.error);
//       }
//     } catch (error) {
//       console.error('Error logging call:', error);
//       throw error;
//     }
//   };

//   const alertResponders = async (reportId: string, alertData: any) => {
//     try {
//       // Dispatch to appropriate organizations
//       const dispatches = await organizationAlertService.dispatchEmergencyAlert({
//         id: reportId,
//         type: alertData.type,
//         location: alertData.location,
//         coordinates: alertData.coordinates,
//         priority: alertData.priority,
//         description: alertData.description,
//         hasEvidence: alertData.hasEvidence,
//         aiClassified: alertData.aiClassified,
//         aiConfidence: alertData.aiConfidence,
//       });

//       // Play audio alert for emergency dispatch
//       if (user && ['responder', 'admin'].includes(user.role)) {
//         reactNativeAudioAlertService.playIncidentAlert(alertData.type, alertData.priority);
//       }

//       // Create system alert for tracking
//       await apiService.createAlert({
//         type: 'emergency',
//         title: `🚨 EMERGENCY DISPATCHED: ${alertData.type.toUpperCase()}`,
//         description: `Alert sent to ${dispatches.length} organization(s) - ${alertData.location}`,
//         priority: alertData.priority,
//         location: alertData.location,
//         affectedAreas: ['System'],
//       });

//       // Reload alerts to get updated data
//       await loadAlerts();
      
//       console.log(`🚨 EMERGENCY DISPATCHED TO ${dispatches.length} ORGANIZATIONS`);
//       dispatches.forEach(dispatch => {
//         const org = organizationAlertService.getOrganization(dispatch.organizationId);
//         console.log(`📡 ${org?.name} - ${dispatch.personnelAlerted.length} personnel alerted`);
//       });
//     } catch (error) {
//       console.error('Failed to dispatch emergency alert:', error);
      
//       // Play fallback audio alert
//       audioAlertService.playEmergencyAlert('high');
      
//       // Fallback to basic alert
//       await apiService.createAlert({
//         type: 'emergency',
//         title: `🚨 NEW EMERGENCY: ${alertData.type.toUpperCase()}`,
//         description: `${alertData.hasEvidence ? '📸 Evidence attached' : '📝 Manual report'} - ${alertData.location}`,
//         priority: alertData.priority,
//         location: alertData.location,
//         affectedAreas: ['All Responders'],
//       });

//       await loadAlerts();
//     }
//   };

//   const getReportsByUser = (userId: string): EmergencyReport[] => {
//     return reports.filter(report => report.reportedBy === userId);
//   };

//   const getClusteredIncidents = (): ClusteredIncident[] => {
//     return clusteredIncidents;
//   };

//   const getClusterStatistics = useCallback(() => {
//     return incidentClusteringService.getClusterStatistics(clusteredIncidents);
//   }, [clusteredIncidents]);

//   const getCallsByUser = async (userId: string): Promise<EmergencyCall[]> => {
//     try {
//       const response = await apiService.getEmergencyCallsByUser();
//       return response.data || [];
//     } catch (error) {
//       console.error('Error getting calls by user:', error);
//       return [];
//     }
//   };

//   const createAlert = async (alertData: Omit<Alert, 'id' | 'issuedAt' | 'isActive'>) => {
//     try {
//       const response = await apiService.createAlert({
//         type: alertData.type,
//         title: alertData.title,
//         description: alertData.description,
//         priority: alertData.priority,
//         location: alertData.location,
//         affectedAreas: alertData.affectedAreas,
//         expiresAt: alertData.expiresAt,
//       });
      
//       if (response.error) {
//         throw new Error(response.error);
//       }
      
//       await loadAlerts();
//     } catch (error) {
//       console.error('Error creating alert:', error);
//       throw error;
//     }
//   };

//   const dismissAlert = async (alertId: string) => {
//     try {
//       const response = await apiService.dismissAlert(alertId);
      
//       if (response.error) {
//         throw new Error(response.error);
//       }
      
//       await loadAlerts();
//     } catch (error) {
//       console.error('Error dismissing alert:', error);
//       throw error;
//     }
//   };

//   const getActiveAlerts = (): Alert[] => {
//     return alerts.filter(alert => {
//       if (!alert.isActive) return false;
//       if (alert.expiresAt && new Date(alert.expiresAt) < new Date()) return false;
//       return true;
//     });
//   };

//   const getEmergencyStats = useCallback(() => {
//     // Return calculated stats from current data
//     const today = new Date().toISOString().split('T')[0];
//     const resolvedToday = reports.filter(report =>
//       report.status === 'resolved' &&
//       report.resolvedAt?.startsWith(today)
//     ).length;

//     const activeIncidents = reports.filter(report =>
//       report.status === 'pending' || report.status === 'dispatched' || report.status === 'responding'
//     ).length;

//     return {
//       totalReports: reports.length,
//       activeIncidents,
//       resolvedToday,
//       averageResponseTime: '4.2m', // Could be calculated from database
//     };
//   }, [reports]);

//   const value: EmergencyContextType = {
//     reports,
//     clusteredIncidents,
//     submitReport,
//     updateReportStatus,
//     getReportsByUser,
//     getClusteredIncidents,
//     getClusterStatistics,
//     calls,
//     logCall,
//     getCallsByUser,
//     alerts,
//     createAlert,
//     dismissAlert,
//     getActiveAlerts,
//     alertResponders,
//     getEmergencyStats,
//   };

//   return (
//     <EmergencyContext.Provider value={value}>
//       {children}
//     </EmergencyContext.Provider>
//   );
// }

// export function useEmergency() {
//   const context = useContext(EmergencyContext);
//   if (context === undefined) {
//     console.warn('useEmergency must be used within an EmergencyProvider');
//     // Return a default context to prevent crashes during development
//     return {
//       reports: [],
//       clusteredIncidents: [],
//       submitReport: async () => '',
//       updateReportStatus: async () => {},
//       getReportsByUser: () => [],
//       getClusteredIncidents: () => [],
//       getClusterStatistics: () => ({}),
//       calls: [],
//       logCall: async () => {},
//       getCallsByUser: () => [],
//       alerts: [],
//       createAlert: async () => {},
//       dismissAlert: async () => {},
//       getActiveAlerts: () => [],
//       alertResponders: async () => {},
//       getEmergencyStats: () => ({
//         totalReports: 0,
//         activeIncidents: 0,
//         resolvedToday: 0,
//         averageResponseTime: '0m',
//       }),
//     };
//   }
//   return context;
// }

// import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
// import { AppState, AppStateStatus } from 'react-native';
// import { apiService } from '@/services/apiService';
// import { EmergencyEvidence, ClassificationResult } from '@/services/AIClassificationService';
// import { organizationAlertService, AlertDispatch } from '@/services/organizationAlertService';
// import { incidentClusteringService, ClusteredIncident } from '@/hooks/incidentClusteringService';
// import { reactNativeAudioAlertService } from '@/services/ReactNativeAudioAlertService';
// import { useAuth } from './AuthContext';

// export interface EmergencyReport {
//   id: string;
//   type: string;
//   description: string;
//   location: string;
//   coordinates?: { latitude: number; longitude: number };
//   contactNumber?: string;
//   status: 'pending' | 'dispatched' | 'responding' | 'resolved';
//   priority: 'low' | 'medium' | 'high' | 'critical';
//   reportedBy: string;
//   reportedAt: string;
//   responderId?: string;
//   resolvedAt?: string;
//   notes?: string;
//   evidence?: EmergencyEvidence;
//   aiClassification?: ClassificationResult;
//   useAIClassification?: boolean;
//   dispatches?: AlertDispatch[];
//   assigned_team_id?: string;
// }
// export interface Alert {
//   id: string;
//   type: 'weather' | 'emergency' | 'community' | 'system';
//   title: string;
//   description: string;
//   priority: 'low' | 'medium' | 'high' | 'critical';
//   location: string;
//   issuedAt: string;
//   expiresAt?: string;
//   isActive: boolean;
//   affectedAreas: string[];
// }

// interface EmergencyContextType {
//   reports: EmergencyReport[];
//   clusteredIncidents: ClusteredIncident[];
//   submitReport: (report: Omit<EmergencyReport, 'id' | 'reportedAt' | 'status'>) => Promise<string>;
//   updateReportStatus: (reportId: string, status: EmergencyReport['status'], notes?: string) => Promise<void>;
//   getReportsByUser: (userId: string) => EmergencyReport[];
//   getClusteredIncidents: () => ClusteredIncident[];
//   getClusterStatistics: () => any;

//   alerts: Alert[];
//   createAlert: (alert: Omit<Alert, 'id' | 'issuedAt' | 'isActive'>) => Promise<void>;
//   dismissAlert: (alertId: string) => Promise<void>;
//   getActiveAlerts: () => Alert[];

//   alertResponders: (reportId: string, alertData: any) => Promise<void>;

//   getEmergencyStats: () => {
//     totalReports: number;
//     activeIncidents: number;
//     resolvedToday: number;
//     averageResponseTime: string;
//   };
// }

// const EmergencyContext = createContext<EmergencyContextType | undefined>(undefined);

// export function EmergencyProvider({ children }: { children: React.ReactNode }) {
//   const [reports, setReports] = useState<EmergencyReport[]>([]);
//   const [clusteredIncidents, setClusteredIncidents] = useState<ClusteredIncident[]>([]);
//   const [alerts, setAlerts] = useState<Alert[]>([]);
//   const { authToken, user } = useAuth();

//   const isResponder = user && (user.role === 'responder' || user.role === 'admin');

//   // ✅ Load reports for ALL roles
//   const loadReports = useCallback(async () => {
//     try {
//       let filters: any = {};

//       if (isResponder && user?.organizationId) {
//         filters.organizationId = user.organizationId;
//       }

//       // ✅ Backend returns correct reports per-role
//       const response: any = await apiService.getEmergencyReports(filters);

//       if (response?.data?.data) {
//         const normalized = response.data.data.map((r: any) => ({
//           ...r,
//           reportedBy: r.reported_by,          // ✅ Add this
//           reportedAt: r.created_at,           // ✅ Add this
//           responderId: r.responder_id,        // ✅ Add this
//           // preserve organization id from backend (snake_case or camelCase)
//           organizationId: r.organization_id || r.organizationId,
//           coordinates:
//             r.latitude && r.longitude
//               ? { latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) }
//               : undefined,
//         }));

//         setReports(normalized);
//       } else {
//         setReports([]);
//       }
//     } catch (error) {
//       console.error('Error loading reports:', error);
//     }
//   }, [user, isResponder]);

//   // ✅ Load alerts ONLY for responders/admins
//   const loadAlerts = useCallback(async () => {
//     if (!isResponder) {
//       setAlerts([]);
//       return;
//     }

//     try {
//       const response = await apiService.getActiveAlerts();
//       setAlerts(Array.isArray(response.data) ? response.data : []);
//     } catch (error) {
//       console.error('Error loading alerts:', error);
//     }
//   }, [isResponder]);

//   // Adaptive polling loop to avoid hitting server rate limits
//   useEffect(() => {
//     if (!authToken || !user) return;

//     let mounted = true;
//     let pollTimeout: ReturnType<typeof setTimeout> | null = null;
//     const abortRef = { cancelled: false } as { cancelled: boolean };

//     // pause polling when app is backgrounded
//     const appState = { current: AppState.currentState } as { current: AppStateStatus };

//     const onAppStateChange = (nextAppState: AppStateStatus) => {
//       appState.current = nextAppState;
//     };

//     const subscription = AppState.addEventListener('change', onAppStateChange);

//     // polling parameters
//     const BASE_DELAY = 30000; // 30s base
//     const MIN_DELAY = 10000; // 10s minimum when we want faster updates
//     const MAX_DELAY = 15 * 60 * 1000; // 15 minutes - same as server window
//     let delay = BASE_DELAY;
//     let consecutiveErrors = 0;
//     let isFetching = false;

//     const scheduleNext = (nextDelay: number) => {
//       if (!mounted) return;
//       const jitter = Math.floor(Math.random() * 2000) - 1000; // +/-1s jitter
//       pollTimeout = setTimeout(pollLoop, Math.max(0, nextDelay + jitter));
//     };

//     const pollLoop = async () => {
//       if (!mounted) return;

//       // don't poll while app is backgrounded
//       if (appState.current !== 'active') {
//         scheduleNext(MAX_DELAY);
//         return;
//       }

//       if (isFetching) {
//         // avoid overlapping fetches
//         scheduleNext(delay);
//         return;
//       }

//       isFetching = true;
//       try {
//         // Always refresh reports for all users
//         await loadReports();

//         // Only load alerts for responders/admins
//         if (isResponder) await loadAlerts();

//         // success -> reset error/backoff
//         consecutiveErrors = 0;
//         delay = BASE_DELAY;
//       } catch (err: any) {
//         consecutiveErrors += 1;

//         // If server returned 429 (rate limit), back off aggressively
//         const status = err?.response?.status || err?.status;
//         if (status === 429) {
//           delay = Math.min(MAX_DELAY, delay * 4);
//         } else {
//           // exponential backoff for other errors
//           delay = Math.min(MAX_DELAY, Math.max(MIN_DELAY, delay * 2));
//         }

//         console.warn('Polling error in EmergencyContext, backing off for', delay, 'ms', err);
//       } finally {
//         isFetching = false;
//         if (!abortRef.cancelled && mounted) scheduleNext(delay);
//       }
//     };

//     // Initial load
//     (async () => {
//       try {
//         await loadReports();
//         if (isResponder) await loadAlerts();
//       } catch (e) {
//         console.warn('Initial load failed in EmergencyContext', e);
//       }
//       // start polling loop
//       scheduleNext(delay);
//     })();

//     return () => {
//       mounted = false;
//       abortRef.cancelled = true;
//       if (pollTimeout) clearTimeout(pollTimeout as any);
//       subscription.remove();
//     };
//   }, [authToken, user, isResponder, loadReports, loadAlerts]);

//   // CLUSTER + AUDIO FOR RESPONDERS
//   useEffect(() => {
//     if (!isResponder) {
//       reports.forEach(r => reactNativeAudioAlertService.stopContinuousAlertForReport(r.id));
//       return;
//     }

//     const clusters = incidentClusteringService.clusterIncidents(reports);
//     // If user is scoped to an organization, filter clusters so admins see only their org's clusters
//     if (user?.organizationId) {
//       const filtered = clusters.filter(c => {
//         const primary: any = c.primaryIncident;
//         return (
//           primary.organization_id === user.organizationId ||
//           primary.organizationId === user.organizationId ||
//           // fallback: if cluster consists of incidents from multiple orgs, check relatedIncidents
//           (Array.isArray(c.relatedIncidents) && c.relatedIncidents.some((ri: any) => (ri.organization_id === user.organizationId || ri.organizationId === user.organizationId)))
//         );
//       });
//       setClusteredIncidents(filtered);
//     } else {
//       setClusteredIncidents(clusters);
//     }

//     // Get all report IDs that are in clusters (not primary)
//     const clusteredReportIds = new Set<string>();
//     clusters.forEach(cluster => {
//       if (cluster.relatedIncidents && cluster.relatedIncidents.length > 0) {
//         cluster.relatedIncidents.forEach((incident: any) => {
//           clusteredReportIds.add(incident.id);
//         });
//       }
//     });

//     // Only process primary incidents (those not in the clusteredReportIds set)
//     reports.forEach(report => {
//       // Skip if this report is a related incident in a cluster
//       if (clusteredReportIds.has(report.id)) {
//         reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
//         return;
//       }

//       if (report.status === 'pending' && !report.assigned_team_id) {
//         reactNativeAudioAlertService.startContinuousAlert(
//           report.id,
//           report.type,
//           report.priority,
//           report.location || 'Unknown location',
//           report.description,
//           report.status,
//           report.assigned_team_id
//         );
//       } else if (report.status === 'dispatched' && report.assigned_team_id) {
//         // Check if the user is a member of the assigned team
//         const isAssignedTeamMember = user?.teamId === report.assigned_team_id;

//         console.log(`🔍 Checking alert for report ${report.id}:`);
//         console.log(`   - Assigned team: ${report.assigned_team_id}`);
//         console.log(`   - User team: ${user?.teamId}`);
//         console.log(`   - Is member: ${isAssignedTeamMember}`);

//         if (isAssignedTeamMember) {
//           console.log(`🚨 STARTING ALERT: Report ${report.id} assigned to your team`);
//           reactNativeAudioAlertService.startContinuousAlert(
//             report.id,
//             report.type,
//             report.priority,
//             report.location || 'Unknown location',
//             'TEAM ASSIGNMENT: ' + report.description,
//             report.status,
//             report.assigned_team_id
//           );
//         } else {
//           reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
//         }
//       } else {
//         reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
//       }
//     });
//   }, [reports, isResponder]);

//   // SUBMIT REPORT
//   const submitReport = async (reportData: Omit<EmergencyReport, 'id' | 'reportedAt' | 'status'>): Promise<string> => {
//     try {
//       const response = await apiService.createEmergencyReport({
//         type: reportData.type as any,
//         description: reportData.description,
//         location: reportData.location,
//         coordinates: reportData.coordinates,
//         contactNumber: reportData.contactNumber,
//         priority: reportData.priority,
//         evidence: reportData.evidence,
//         aiClassification: reportData.aiClassification,
//         useAIClassification: reportData.useAIClassification,
//       });

//       if (response.error) {
//         throw new Error(response.error);
//       }

//       const newId = response.data?.id || '';

//       // Dispatch alerts to responsible organizations based on emergency type.
//       // Keep this best-effort: failures to dispatch should not break report submission.
//       try {
//         await organizationAlertService.dispatchEmergencyAlert({
//           id: newId,
//           type: reportData.type as string,
//           location: reportData.location || (reportData.coordinates ? `${reportData.coordinates.latitude},${reportData.coordinates.longitude}` : 'Unknown'),
//           coordinates: reportData.coordinates,
//           priority: reportData.priority as string,
//           description: reportData.description,
//           hasEvidence: Boolean(reportData.evidence),
//           aiClassified: Boolean(reportData.aiClassification),
//           aiConfidence: (reportData.aiClassification as any)?.confidence,
//         });
//       } catch (dispatchError) {
//         console.error('Error dispatching organization alerts:', dispatchError);
//         // don't fail the submit if dispatch fails; continue to refresh reports
//       }

//       // Reload reports to get updated data
//       await loadReports();

//       return newId;
//     } catch (error) {
//       console.error('Error submitting report:', error);
//       throw error;
//     }
//   };

//   // UPDATE STATUS
//   const updateReportStatus = async (reportId: string, status: EmergencyReport['status'], notes?: string) => {
//     try {
//       const response = await apiService.updateEmergencyReportStatus(reportId, status, notes);
//       if (response.error) throw new Error(response.error);
//       await loadReports();
//     } catch (error) {
//       console.error('Error updating report status:', error);
//       throw error;
//     }
//   };

  

//   // DISPATCH RESPONDERS
//   const alertResponders = async (reportId: string, alertData: any) => {
//     try {
//       const dispatches = await organizationAlertService.dispatchEmergencyAlert({
//         id: reportId,
//         ...alertData
//       });

//       if (isResponder) {
//         reactNativeAudioAlertService.playIncidentAlert(alertData.type, alertData.priority);
//       }

//       await apiService.createAlert({
//         type: 'emergency',
//         title: `🚨 EMERGENCY DISPATCHED: ${alertData.type.toUpperCase()}`,
//         description: `Alert sent to ${dispatches.length} org(s) - ${alertData.location}`,
//         priority: alertData.priority,
//         location: alertData.location,
//         affectedAreas: ['System'],
//       });

//       await loadAlerts();
//     } catch (error) {
//       console.error('Failed to dispatch emergency alert:', error);

//       await apiService.createAlert({
//         type: 'emergency',
//         title: `🚨 NEW EMERGENCY: ${alertData.type.toUpperCase()}`,
//         description: `${alertData.hasEvidence ? '📸 Evidence attached' : '📝 Manual report'} - ${alertData.location}`,
//         priority: alertData.priority,
//         location: alertData.location,
//         affectedAreas: ['All Responders'],
//       });

//       await loadAlerts();
//     }
//   };

//   // UTILS
//   const getReportsByUser = (userId: string) => reports.filter(r => r.reportedBy === userId);
//   const getClusteredIncidents = () => clusteredIncidents;
//   const getClusterStatistics = () => incidentClusteringService.getClusterStatistics(clusteredIncidents);


//   const createAlert = async (alertData: Omit<Alert, 'id' | 'issuedAt' | 'isActive'>) => {
//     try {
//       const response = await apiService.createAlert(alertData);
//       if (response.error) throw new Error(response.error);
//       await loadAlerts();
//     } catch (error) {
//       console.error('Error creating alert:', error);
//       throw error;
//     }
//   };

//   const dismissAlert = async (alertId: string) => {
//     try {
//       const response = await apiService.dismissAlert(alertId);
//       if (response.error) throw new Error(response.error);
//       await loadAlerts();
//     } catch (error) {
//       console.error('Error dismissing alert:', error);
//       throw error;
//     }
//   };

//   const getActiveAlerts = () =>
//     alerts.filter(a => a.isActive && (!a.expiresAt || new Date(a.expiresAt) >= new Date()));

//   const getEmergencyStats = () => {
//     const today = new Date().toISOString().split('T')[0];
//     return {
//       totalReports: reports.length,
//       activeIncidents: reports.filter(r => ['pending', 'dispatched', 'responding'].includes(r.status)).length,
//       resolvedToday: reports.filter(r => r.status === 'resolved' && r.resolvedAt?.startsWith(today)).length,
//       averageResponseTime: '4.2m',
//     };
//   };

//   const value: EmergencyContextType = {
//     reports,
//     clusteredIncidents,
//     submitReport,
//     updateReportStatus,
//     getReportsByUser,
//     getClusteredIncidents,
//     getClusterStatistics,
//     alerts,
//     createAlert,
//     dismissAlert,
//     getActiveAlerts,
//     alertResponders,
//     getEmergencyStats,
//   };

//   return <EmergencyContext.Provider value={value}>{children}</EmergencyContext.Provider>;
// }

// export function useEmergency() {
//   const context = useContext(EmergencyContext);
//   if (!context) {
//     return {
//       reports: [],
//       clusteredIncidents: [],
//       submitReport: async () => '',
//       updateReportStatus: async () => {},
//       getReportsByUser: () => [],
//       getClusteredIncidents: () => [],
//       getClusterStatistics: () => ({}),
//       calls: [],
//       logCall: async () => {},
//       getCallsByUser: () => [],
//       alerts: [],
//       createAlert: async () => {},
//       dismissAlert: async () => {},
//       getActiveAlerts: () => [],
//       alertResponders: async () => {},
//       getEmergencyStats: () => ({
//         totalReports: 0,
//         activeIncidents: 0,
//         resolvedToday: 0,
//         averageResponseTime: '0m',
//       }),
//     };
//   }
//   return context;
// }


import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiService } from '@/services/apiService';
import { EmergencyEvidence, ClassificationResult } from '@/services/AIClassificationService';
import { organizationAlertService, AlertDispatch } from '@/services/organizationAlertService';
import { incidentClusteringService, ClusteredIncident } from '@/hooks/incidentClusteringService';
import { reactNativeAudioAlertService } from '@/services/ReactNativeAudioAlertService';
import { useAuth } from './AuthContext';

export interface EmergencyReport {
  id: string;
  type: string;
  description: string;
  location: string;
  coordinates?: { latitude: number; longitude: number };
  contactNumber?: string;
  status: 'pending' | 'dispatched' | 'responding' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  reportedBy: string;
  reportedAt: string;
  responderId?: string;
  resolvedAt?: string;
  notes?: string;
  evidence?: EmergencyEvidence;
  aiClassification?: ClassificationResult;
  useAIClassification?: boolean;
  dispatches?: AlertDispatch[];
  assigned_team_id?: string;
}
export interface Alert {
  id: string;
  type: 'weather' | 'emergency' | 'community' | 'system';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  issuedAt: string;
  expiresAt?: string;
  isActive: boolean;
  affectedAreas: string[];
}

interface EmergencyContextType {
  reports: EmergencyReport[];
  clusteredIncidents: ClusteredIncident[];
  submitReport: (report: Omit<EmergencyReport, 'id' | 'reportedAt' | 'status'>) => Promise<string>;
  updateReportStatus: (reportId: string, status: EmergencyReport['status'], notes?: string) => Promise<void>;
  getReportsByUser: (userId: string) => EmergencyReport[];
  getClusteredIncidents: () => ClusteredIncident[];
  getClusterStatistics: () => any;

  alerts: Alert[];
  createAlert: (alert: Omit<Alert, 'id' | 'issuedAt' | 'isActive'>) => Promise<void>;
  dismissAlert: (alertId: string) => Promise<void>;
  getActiveAlerts: () => Alert[];

  alertResponders: (reportId: string, alertData: any) => Promise<void>;

  getEmergencyStats: () => {
    totalReports: number;
    activeIncidents: number;
    resolvedToday: number;
    averageResponseTime: string;
  };
}

const EmergencyContext = createContext<EmergencyContextType | undefined>(undefined);

export function EmergencyProvider({ children }: { children: React.ReactNode }) {
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [clusteredIncidents, setClusteredIncidents] = useState<ClusteredIncident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const { authToken, user } = useAuth();

  const isResponder = user && (user.role === 'responder' || user.role === 'admin');

  // ✅ Load reports for ALL roles
  const loadReports = useCallback(async () => {
    try {
      let filters: any = {};

      if (isResponder && user?.organizationId) {
        filters.organizationId = user.organizationId;
      }

      // ✅ Backend returns correct reports per-role
      const response: any = await apiService.getEmergencyReports(filters);

      if (response?.data?.data) {
        const normalized = response.data.data.map((r: any) => ({
          ...r,
          reportedBy: r.reported_by,          // ✅ Add this
          reportedAt: r.created_at,           // ✅ Add this
          responderId: r.responder_id,        // ✅ Add this
          // preserve organization id from backend (snake_case or camelCase)
          organizationId: r.organization_id || r.organizationId,
          coordinates:
            r.latitude && r.longitude
              ? { latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) }
              : undefined,
        }));

        setReports(normalized);
      } else {
        setReports([]);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  }, [user, isResponder]);

  // ✅ Load alerts ONLY for responders/admins
  const loadAlerts = useCallback(async () => {
    if (!isResponder) {
      setAlerts([]);
      return;
    }

    try {
      const response = await apiService.getActiveAlerts();
      setAlerts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  }, [isResponder]);

  // ✅ MAIN EFFECT — FIXED ✅
  useEffect(() => {
    if (!authToken || !user) return;

    // ✅ Load reports for ALL USERS (citizen/responder/admin)
    loadReports();

    // ✅ Alerts only for responders/admins
    if (isResponder) {
      loadAlerts();
    } else {
      setAlerts([]); // ensure citizens have no alerts
    }

    // ✅ Poll logic
    const pollInterval = setInterval(() => {
      loadReports();
      if (isResponder) loadAlerts();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [authToken, user, isResponder, loadReports, loadAlerts]);

  // CLUSTER + AUDIO FOR RESPONDERS
  useEffect(() => {
    if (!isResponder) {
      reports.forEach(r => reactNativeAudioAlertService.stopContinuousAlertForReport(r.id));
      return;
    }

    const clusters = incidentClusteringService.clusterIncidents(reports);
    // If user is scoped to an organization, filter clusters so admins see only their org's clusters
    if (user?.organizationId) {
      const filtered = clusters.filter(c => {
        const primary: any = c.primaryIncident;
        return (
          primary.organization_id === user.organizationId ||
          primary.organizationId === user.organizationId ||
          // fallback: if cluster consists of incidents from multiple orgs, check relatedIncidents
          (Array.isArray(c.relatedIncidents) && c.relatedIncidents.some((ri: any) => (ri.organization_id === user.organizationId || ri.organizationId === user.organizationId)))
        );
      });
      setClusteredIncidents(filtered);
    } else {
      setClusteredIncidents(clusters);
    }

    // Get all report IDs that are in clusters (not primary)
    const clusteredReportIds = new Set<string>();
    clusters.forEach(cluster => {
      if (cluster.relatedIncidents && cluster.relatedIncidents.length > 0) {
        cluster.relatedIncidents.forEach((incident: any) => {
          clusteredReportIds.add(incident.id);
        });
      }
    });

    // Only process primary incidents (those not in the clusteredReportIds set)
    reports.forEach(report => {
      // Skip if this report is a related incident in a cluster
      if (clusteredReportIds.has(report.id)) {
        reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
        return;
      }

      if (report.status === 'pending' && !report.assigned_team_id) {
        reactNativeAudioAlertService.startContinuousAlert(
          report.id,
          report.type,
          report.priority,
          report.location || 'Unknown location',
          report.description,
          report.status,
          report.assigned_team_id
        );
      } else if (report.status === 'dispatched' && report.assigned_team_id) {
        // Check if the user is a member of the assigned team
        const isAssignedTeamMember = user?.teamId === report.assigned_team_id;

        console.log(`🔍 Checking alert for report ${report.id}:`);
        console.log(`   - Assigned team: ${report.assigned_team_id}`);
        console.log(`   - User team: ${user?.teamId}`);
        console.log(`   - Is member: ${isAssignedTeamMember}`);

        if (isAssignedTeamMember) {
          console.log(`🚨 STARTING ALERT: Report ${report.id} assigned to your team`);
          reactNativeAudioAlertService.startContinuousAlert(
            report.id,
            report.type,
            report.priority,
            report.location || 'Unknown location',
            'TEAM ASSIGNMENT: ' + report.description,
            report.status,
            report.assigned_team_id
          );
        } else {
          reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
        }
      } else {
        reactNativeAudioAlertService.stopContinuousAlertForReport(report.id);
      }
    });
  }, [reports, isResponder]);

  // SUBMIT REPORT
  const submitReport = async (reportData: Omit<EmergencyReport, 'id' | 'reportedAt' | 'status'>): Promise<string> => {
    try {
      const response = await apiService.createEmergencyReport({
        type: reportData.type as any,
        description: reportData.description,
        location: reportData.location,
        coordinates: reportData.coordinates,
        contactNumber: reportData.contactNumber,
        priority: reportData.priority,
        evidence: reportData.evidence,
        aiClassification: reportData.aiClassification,
        useAIClassification: reportData.useAIClassification,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const newId = response.data?.id || '';

      // Dispatch alerts to responsible organizations based on emergency type.
      // Keep this best-effort: failures to dispatch should not break report submission.
      try {
        await organizationAlertService.dispatchEmergencyAlert({
          id: newId,
          type: reportData.type as string,
          location: reportData.location || (reportData.coordinates ? `${reportData.coordinates.latitude},${reportData.coordinates.longitude}` : 'Unknown'),
          coordinates: reportData.coordinates,
          priority: reportData.priority as string,
          description: reportData.description,
          hasEvidence: Boolean(reportData.evidence),
          aiClassified: Boolean(reportData.aiClassification),
          aiConfidence: (reportData.aiClassification as any)?.confidence,
        });
      } catch (dispatchError) {
        console.error('Error dispatching organization alerts:', dispatchError);
        // don't fail the submit if dispatch fails; continue to refresh reports
      }

      // Reload reports to get updated data
      await loadReports();

      return newId;
    } catch (error) {
      console.error('Error submitting report:', error);
      throw error;
    }
  };

  // UPDATE STATUS
  const updateReportStatus = async (reportId: string, status: EmergencyReport['status'], notes?: string) => {
    try {
      const response = await apiService.updateEmergencyReportStatus(reportId, status, notes);
      if (response.error) throw new Error(response.error);
      await loadReports();
    } catch (error) {
      console.error('Error updating report status:', error);
      throw error;
    }
  };

  

  // DISPATCH RESPONDERS
  const alertResponders = async (reportId: string, alertData: any) => {
    try {
      const dispatches = await organizationAlertService.dispatchEmergencyAlert({
        id: reportId,
        ...alertData
      });

      if (isResponder) {
        reactNativeAudioAlertService.playIncidentAlert(alertData.type, alertData.priority);
      }

      await apiService.createAlert({
        type: 'emergency',
        title: `🚨 EMERGENCY DISPATCHED: ${alertData.type.toUpperCase()}`,
        description: `Alert sent to ${dispatches.length} org(s) - ${alertData.location}`,
        priority: alertData.priority,
        location: alertData.location,
        affectedAreas: ['System'],
      });

      await loadAlerts();
    } catch (error) {
      console.error('Failed to dispatch emergency alert:', error);

      await apiService.createAlert({
        type: 'emergency',
        title: `🚨 NEW EMERGENCY: ${alertData.type.toUpperCase()}`,
        description: `${alertData.hasEvidence ? '📸 Evidence attached' : '📝 Manual report'} - ${alertData.location}`,
        priority: alertData.priority,
        location: alertData.location,
        affectedAreas: ['All Responders'],
      });

      await loadAlerts();
    }
  };

  // UTILS
  const getReportsByUser = (userId: string) => reports.filter(r => r.reportedBy === userId);
  const getClusteredIncidents = () => clusteredIncidents;
  const getClusterStatistics = () => incidentClusteringService.getClusterStatistics(clusteredIncidents);


  const createAlert = async (alertData: Omit<Alert, 'id' | 'issuedAt' | 'isActive'>) => {
    try {
      const response = await apiService.createAlert(alertData);
      if (response.error) throw new Error(response.error);
      await loadAlerts();
    } catch (error) {
      console.error('Error creating alert:', error);
      throw error;
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const response = await apiService.dismissAlert(alertId);
      if (response.error) throw new Error(response.error);
      await loadAlerts();
    } catch (error) {
      console.error('Error dismissing alert:', error);
      throw error;
    }
  };

  const getActiveAlerts = () =>
    alerts.filter(a => a.isActive && (!a.expiresAt || new Date(a.expiresAt) >= new Date()));

  const getEmergencyStats = () => {
    const today = new Date().toISOString().split('T')[0];
    return {
      totalReports: reports.length,
      activeIncidents: reports.filter(r => ['pending', 'dispatched', 'responding'].includes(r.status)).length,
      resolvedToday: reports.filter(r => r.status === 'resolved' && r.resolvedAt?.startsWith(today)).length,
      averageResponseTime: '4.2m',
    };
  };

  const value: EmergencyContextType = {
    reports,
    clusteredIncidents,
    submitReport,
    updateReportStatus,
    getReportsByUser,
    getClusteredIncidents,
    getClusterStatistics,
    alerts,
    createAlert,
    dismissAlert,
    getActiveAlerts,
    alertResponders,
    getEmergencyStats,
  };

  return <EmergencyContext.Provider value={value}>{children}</EmergencyContext.Provider>;
}

export function useEmergency() {
  const context = useContext(EmergencyContext);
  if (!context) {
    return {
      reports: [],
      clusteredIncidents: [],
      submitReport: async () => '',
      updateReportStatus: async () => {},
      getReportsByUser: () => [],
      getClusteredIncidents: () => [],
      getClusterStatistics: () => ({}),
      calls: [],
      logCall: async () => {},
      getCallsByUser: () => [],
      alerts: [],
      createAlert: async () => {},
      dismissAlert: async () => {},
      getActiveAlerts: () => [],
      alertResponders: async () => {},
      getEmergencyStats: () => ({
        totalReports: 0,
        activeIncidents: 0,
        resolvedToday: 0,
        averageResponseTime: '0m',
      }),
    };
  }
  return context;
}

