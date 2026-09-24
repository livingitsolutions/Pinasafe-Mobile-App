export type UserItem = {
  id: string | number;
  name?: string;
  email?: string;
  address: string;
  phone?: string;
  organizationId?: string | number;
  position?: string;
  role?: 'responder' | 'admin' | string;
  status?: string;
  location?: string;
  joinDate?: string;
  team?: string;
  verified?: boolean;
};