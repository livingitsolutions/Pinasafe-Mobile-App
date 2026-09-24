// import { supabase } from '@/lib/supabase';
// import { databaseService } from '@/services/databaseService';
// import React, { createContext, useContext, useEffect, useState } from 'react';

// export type UserRole = 'citizen' | 'responder' | 'admin';

// export interface User {
//   id: string;
//   email: string;
//   name: string;
//   role: UserRole;
//   phone?: string;
//   address?: string;
//   verified: boolean;
//   createdAt: string;
//   organizationId?: string;
//   personnelId?: string;
// }

// interface AuthContextType {
//   user: User | null;
//   isLoading: boolean;
//   isAuthenticated: boolean;
//   signIn: (email: string, password: string) => Promise<User>;
//   signUp: (email: string, password: string, userData: any) => Promise<void>;
//   signOut: () => Promise<void>;
//   hasPermission: (permission: string) => boolean;
//   hasRole: (role: UserRole) => boolean;
//   refreshUser: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextType | undefined>(undefined);

// // 🔹 Toggle flag for mock vs Supabase
// const useMockAuth = true;

// // Mock users
// const mockUsers = {
//   citizen: {
//     id: '1',
//     email: 'citizen@pinasafe.com',
//     password: 'citizen123',
//     role: 'citizen',
//     name: 'Juan Dela Cruz',
//   },
//   responder: {
//     id: '2',
//     email: 'responder@pinasafe.com',
//     password: 'responder123',
//     role: 'responder',
//     name: 'PO1 Maria Santos',
//   },
//   admin: {
//     id: '3',
//     email: 'admin@pinasafe.com',
//     password: 'admin123',
//     role: 'admin',
//     name: 'Hilongos Admin',
//   },
// };



// // Role-based permissions
// const rolePermissions: Record<UserRole, string[]> = {
//   citizen: [
//     'emergency.call',
//     'emergency.report',
//     'alerts.view',
//     'contacts.view',
//     'profile.edit',
//   ],
//   responder: [
//     'emergency.call',
//     'emergency.report',
//     'emergency.respond',
//     'alerts.view',
//     'alerts.create',
//     'contacts.view',
//     'contacts.manage',
//     'profile.edit',
//     'incidents.view',
//     'incidents.update',
//   ],
//   admin: [
//     'emergency.call',
//     'emergency.report',
//     'emergency.respond',
//     'alerts.view',
//     'alerts.create',
//     'alerts.manage',
//     'contacts.view',
//     'contacts.manage',
//     'profile.edit',
//     'incidents.view',
//     'incidents.create',
//     'incidents.update',
//     'incidents.delete',
//     'users.view',
//     'users.manage',
//     'system.manage',
//   ],
// };

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [user, setUser] = useState<User | null>(null);
//   const [isLoading, setIsLoading] = useState(true);

//   useEffect(() => {
//     if (!useMockAuth) {
//       initializeAuth();
//     } else {
//       setIsLoading(false); // Skip Supabase init in mock mode
//     }
//   }, []);

//   const initializeAuth = async () => {
//     try {
//       // Check for existing session
//       const { data: { session } } = await supabase.auth.getSession();
      
//       if (session?.user) {
//         await loadUserProfile(session.user.id);
        
//         // Initialize default data after user is loaded (only for admins)
//         await databaseService.initializeDefaultData();
        
//         // Create initial system alert if user is admin and none exist
//         await createInitialSystemAlert();
//       }
      
//       // Listen for auth changes
//       supabase.auth.onAuthStateChange(async (event, session) => {
//         if (event === 'SIGNED_IN' && session?.user) {
//           await loadUserProfile(session.user.id);
//           // Initialize default data for new admin users
//           await databaseService.initializeDefaultData();
//           await createInitialSystemAlert();
//         } else if (event === 'SIGNED_OUT') {
//           setUser(null);
//         }
//       });
//     } catch (error) {
//       console.error('Error initializing auth:', error);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const createInitialSystemAlert = async () => {
//     try {
//       // Only create system alert if user is admin
//       if (user?.role === 'admin') {
//         const existingAlerts = await databaseService.getActiveSystemAlerts();
//         if (existingAlerts.length === 0) {
//           await databaseService.createSystemAlert({
//             type: 'system',
//             title: 'PinaSafe System Online',
//             description: 'Emergency response system is active and monitoring',
//             priority: 'low',
//             location: 'System Wide',
//             affected_areas: ['System'],
//           });
//         }
//       }
//     } catch (error) {
//       // Silently fail - not critical for app functionality
//       console.log('System alert creation skipped - insufficient permissions');
//     }
//   };

//   const loadUserProfile = async (userId: string) => {
//     try {
//       const profile = await databaseService.getProfile(userId);
//       if (profile) {
//         const userData: User = {
//           id: profile.id,
//           email: profile.email,
//           name: profile.name,
//           role: profile.role,
//           phone: profile.phone || undefined,
//           address: profile.address || undefined,
//           verified: profile.verified,
//           createdAt: profile.created_at,
//           organizationId: profile.organization_id || undefined,
//           personnelId: profile.personnel_id || undefined,
//         };
//         setUser(userData);
//       }
//     } catch (error) {
//       console.error('Error loading user profile:', error);
//     }
//   };

//   const signIn = async (email: string, password: string): Promise<User> => {
//     const lowerEmail = email.toLowerCase();

//     // 🔹 Mock mode
//     if (useMockAuth) {
//       const mockUser = Object.values(mockUsers).find(
//         (u) => u.email === lowerEmail && u.password === password
//       );

//       if (!mockUser) {
//         throw new Error('Invalid email or password');
//       }

//       const userData: User = {
//         id: mockUser.id,
//         email: mockUser.email,
//         name: mockUser.name,
//         role: mockUser.role as UserRole,
//         verified: true,
//         createdAt: new Date().toISOString(),
//       };

//       setUser(userData);
//       await new Promise((resolve) => setTimeout(resolve, 300));
//       return userData;
//     }

//     // 🔹 Supabase mode
//     const { data, error } = await supabase.auth.signInWithPassword({
//       email: lowerEmail,
//       password,
//     });

//     if (error) throw error;
//     if (!data.user) throw new Error('No user returned');

//     await loadUserProfile(data.user.id);

//     if (!user) throw new Error('Failed to load user profile');
//     return user;
//   };


//   const signUp = async (email: string, password: string, userData: any) => {
//     try {
//       // Combine address components into single address string
//       const addressComponents = [
//         userData.streetName,
//         userData.barangay ? `Brgy. ${userData.barangay}` : '',
//         userData.city,
//         userData.province,
//         userData.country,
//         userData.zipcode
//       ].filter(Boolean);
      
//       const combinedAddress = addressComponents.join(', ');

//       // Sign up with Supabase Auth
//       const { data, error } = await supabase.auth.signUp({
//         email: email.toLowerCase(),
//         password,
//         options: {
//           data: {
//             name: userData.name,
//             phone: userData.phone,
//             address: combinedAddress,
//             city: userData.selectedCityName, // Use readable name
//             barangay: userData.selectedBarangayName, // Use readable name
//             province: userData.province,
//             country: userData.country,
//             zipcode: userData.zipcode,
//           }
//         }
//       });

//       if (error) throw error;
//       if (!data.user) throw new Error('No user returned from signup');

//       // Create user profile in database
//       const profile = await databaseService.createProfile({
//         user_id: data.user.id,
//         email: email.toLowerCase(),
//         name: userData.name,
//         role: 'citizen', // Default role for new signups
//         phone: userData.phone,
//         address: combinedAddress,
//         verified: false, // New users start unverified
//       });

//       // Load the created profile
//       await loadUserProfile(data.user.id);

//       // If email confirmation is disabled, user is immediately signed in
//       if (data.session) {
//         console.log('✅ User signed up and automatically signed in');
//       } else {
//         console.log('📧 User signed up - email confirmation may be required');
//       }

//       return profile;
//     } catch (error) {
//       console.error('❌ Sign up error:', error);
//       throw error;
//     }
//   };

//   const signOut = async () => {
//     await supabase.auth.signOut();
//     setUser(null);
//   };

//   const refreshUser = async () => {
//     const { data: { user: authUser } } = await supabase.auth.getUser();
//     if (authUser) {
//       await loadUserProfile(authUser.id);
//     }
//   };

//   const hasPermission = (permission: string): boolean => {
//     if (!user) return false;
//     return rolePermissions[user.role]?.includes(permission) || false;
//   };

//   const hasRole = (role: UserRole): boolean => {
//     return user?.role === role || false;
//   };

//   const value: AuthContextType = {
//     user,
//     isLoading,
//     isAuthenticated: !!user,
//     signIn,
//     signUp,
//     signOut,
//     refreshUser,
//     hasPermission,
//     hasRole,
//   };

//   return (
//     <AuthContext.Provider value={value}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth() {
//   const context = useContext(AuthContext);
//   if (context === undefined) {
//     throw new Error('useAuth must be used within an AuthProvider');
//   }
//   return context;
// }

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '@/services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UserRole = 'citizen' | 'responder' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  address?: string;
  verified: boolean;
  createdAt: string;
  organizationId?: string;
  personnelId?: string;
  teamId?: string;
  teams?: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, userData: any) => Promise<User | undefined>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  refreshUser: () => Promise<void>;
  authToken: string | null; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Role-based permissions
const rolePermissions: Record<UserRole, string[]> = {
  citizen: [
    'emergency.call',
    'emergency.report',
    'alerts.view',
    'contacts.view',
    'profile.edit',
  ],
  responder: [
    'emergency.call',
    'emergency.report',
    'emergency.respond',
    'alerts.view',
    'alerts.create',
    'contacts.view',
    'contacts.manage',
    'profile.edit',
    'incidents.view',
    'incidents.update',
  ],
  admin: [
    'emergency.call',
    'emergency.report',
    'emergency.respond',
    'alerts.view',
    'alerts.create',
    'alerts.manage',
    'contacts.view',
    'contacts.manage',
    'profile.edit',
    'incidents.view',
    'incidents.create',
    'incidents.update',
    'incidents.delete',
    'users.view',
    'users.manage',
    'system.manage',
  ],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mapApiUser = (u: any): User => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone || undefined,
    address: u.address || undefined,
    verified: !!u.verified,
    createdAt: u.created_at || u.createdAt || new Date().toISOString(),
    organizationId: u.organization_id || u.organizationId || undefined,
    personnelId: u.personnel_id || u.personnelId || undefined,
    teamId: u.team_id || u.teamId || undefined,
  });

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Check for stored token
      const token = await AsyncStorage.getItem('auth_token');
      
      if (token) {
        apiService.setToken(token);
        setAuthToken(token);
        await loadUserProfile();
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserProfile = async () => {
    try {
      const response = await apiService.getProfile();
      if (response.data) {
        // response.data may be { user } or { data: user } or user directly
        const raw = response.data.user || response.data.data || response.data;
        setUser(mapApiUser(raw));
      } else {
        // Token might be invalid, clear it
        await signOut();
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      await signOut();
    }
  };

  const signIn = async (email: string, password: string): Promise<User & { mustChangePassword?: boolean }> => {
    const response = await apiService.login(email, password);
    if (response.error) {
      throw new Error(response.error);
    }
    if (response.data) {
      const raw = response.data.user || response.data;
      const mapped = mapApiUser(raw);
      setUser(mapped);
      return {
        ...mapped,
        mustChangePassword: response.data.mustChangePassword
      };
    }
    throw new Error('Login failed');
  };

  const signUp = async (email: string, password: string, userData: any) => {
    try {
      // Combine address components into single address string
      const addressComponents = [
        userData.streetName,
        userData.selectedBarangayName ? `Brgy. ${userData.selectedBarangayName}` : '',
        userData.selectedCityName,
        userData.province,
        userData.country,
        userData.zipcode
      ].filter(Boolean);
      
      const combinedAddress = addressComponents.join(', ');

      // Create user via API
      const response = await apiService.register({
        email,
        password,
        name: userData.name,
        phone: userData.phone,
        address: combinedAddress,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data) {
        const raw = response.data.user || response.data;
        const mapped = mapApiUser(raw);
        setUser(mapped);
        console.log('✅ User signed up and automatically signed in');
        return mapped;
      }

      return undefined;
    } catch (error) {
      console.error('❌ Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    await apiService.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    if (apiService.isAuthenticated()) {
      await loadUserProfile();
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return rolePermissions[user.role]?.includes(permission) || false;
  };

  const hasRole = (role: UserRole): boolean => {
    return user?.role === role || false;
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    refreshUser,
    hasPermission,
    hasRole,
    authToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}