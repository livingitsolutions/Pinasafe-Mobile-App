# PinaSafe Alert System and Personnel Management Update

## Overview
Updated the PinaSafe emergency response system to implement organization-based filtering for emergency reports and alerts, plus comprehensive personnel and team management features.

## Key Changes

### 1. Database Schema Updates

#### New Migration: `add_personnel_and_team_management`
- Added `super_admin` role to users table for system-wide access
- Updated personnel table with:
  - `user_id` field to link personnel with user accounts
  - `personnel_role` field ('staff' or 'rescue_member')
- Created `rescue_teams` table for managing response teams
- Created `team_members` table for team assignments
- Added validation triggers to ensure only rescue members can be added to teams

#### Role Hierarchy
- **Super Admin**: Can see all emergency reports across all organizations
- **Admin**: Can manage personnel and teams within their organization, see organization-specific reports
- **Responder**: Can be assigned to teams (if rescue_member), see organization-specific reports
- **Citizen**: Can only submit and view their own reports

### 2. Backend API Updates

#### Updated Routes
- **Emergency Reports** (`/api/emergency-reports`):
  - Super-admins see all reports
  - Admins/Responders from BFP see only fire incidents
  - Admins/Responders from rescue organizations see only road incidents
  - Citizens see only their own reports

- **Alerts** (`/api/alerts`):
  - Organization-based filtering applied
  - Fire organizations see fire-related alerts
  - Rescue organizations see safety-related alerts

#### New Routes
- **Personnel Management** (`/api/personnel`):
  - `GET /api/personnel` - List all personnel (filtered by organization for admins)
  - `POST /api/personnel` - Add new personnel (admin only)
  - `PUT /api/personnel/:id` - Update personnel details
  - `DELETE /api/personnel/:id` - Deactivate personnel
  - `GET /api/personnel/rescue-members` - Get rescue members for team assignments

- **Team Management** (`/api/teams`):
  - `GET /api/teams` - List all teams (filtered by organization)
  - `POST /api/teams` - Create new team (admin only)
  - `PUT /api/teams/:id` - Update team details
  - `DELETE /api/teams/:id` - Deactivate team
  - `POST /api/teams/:id/members` - Add member to team (rescue members only)
  - `DELETE /api/teams/:id/members/:memberId` - Remove team member
  - `GET /api/teams/:id` - Get team details with members

### 3. Mobile App Updates

#### New Services
- **personnelService.ts**: Handles all personnel management API calls
- **teamService.ts**: Handles all team management API calls

#### New Components
- **PersonnelManagement.tsx**:
  - Full CRUD interface for personnel management
  - Role selection (Staff or Rescue Member)
  - Organization-scoped access
  - Add, edit, deactivate personnel

- **TeamManagement.tsx**:
  - Full CRUD interface for rescue team management
  - Team leader assignment (rescue members only)
  - Team member management
  - Add/remove members from teams
  - Validates only rescue members can be added to teams

### 4. Business Rules Implemented

1. **Organization-Based Filtering**:
   - Fire incidents → BFP organization only
   - Road incidents → Rescue organizations only
   - Super-admins bypass all filters

2. **Personnel Management**:
   - Only admins can add personnel to their organization
   - Two roles: Staff (administrative) and Rescue Member (field personnel)
   - Personnel linked to user accounts via user_id

3. **Team Management**:
   - Only admins can create and manage teams
   - Only rescue members eligible for team assignments
   - Team leaders must be rescue members
   - Members can be added/removed dynamically

4. **Access Control**:
   - All operations properly scoped to user's organization
   - RLS policies enforce database-level security
   - API middleware validates permissions

## How to Use

### For Admins

#### Managing Personnel
1. Navigate to Personnel Management section
2. Click "Add Personnel"
3. Fill in details and select role (Staff or Rescue Member)
4. Personnel with rescue_member role become eligible for team assignments

#### Managing Teams
1. Navigate to Team Management section
2. Click "Create Team"
3. Assign a team leader (must be a rescue member)
4. Add team members (only rescue members can be added)
5. Team members can be removed as needed

### For Responders
- View emergency reports filtered by organization type
- View alerts relevant to organization
- View team assignments (if part of a rescue team)

### For Super Admins
- Full access to all emergency reports
- Can view all organizations and their activities
- System-wide monitoring capabilities

## Database Security

All tables have Row Level Security (RLS) enabled with policies that:
- Restrict data access based on user role and organization
- Prevent unauthorized modifications
- Enforce business rules at the database level
- Allow super-admins system-wide access

## API Endpoints Summary

```
Personnel Management:
GET    /api/personnel                    - List personnel
POST   /api/personnel                    - Create personnel
PUT    /api/personnel/:id                - Update personnel
DELETE /api/personnel/:id                - Deactivate personnel
GET    /api/personnel/rescue-members     - Get rescue members

Team Management:
GET    /api/teams                        - List teams
POST   /api/teams                        - Create team
PUT    /api/teams/:id                    - Update team
DELETE /api/teams/:id                    - Deactivate team
POST   /api/teams/:id/members            - Add team member
DELETE /api/teams/:id/members/:memberId  - Remove team member
GET    /api/teams/:id                    - Get team details
```

## Files Modified/Created

### Backend
- `src/routes/emergency.js` - Updated for organization filtering
- `src/routes/alerts.js` - Updated for organization filtering
- `src/routes/personnel.js` - New personnel management routes
- `src/routes/teams.js` - New team management routes
- `src/server.js` - Added new route handlers

### Mobile
- `services/personnelService.ts` - New service for personnel API
- `services/teamService.ts` - New service for teams API
- `components/PersonnelManagement.tsx` - Personnel management UI
- `components/TeamManagement.tsx` - Team management UI

### Database
- `supabase/migrations/add_personnel_and_team_management.sql` - Schema updates

## Testing Recommendations

1. Test super-admin can see all reports
2. Test BFP admin sees only fire incidents
3. Test rescue admin sees only road incidents
4. Test citizens see only their own reports
5. Test personnel creation and role assignment
6. Test team creation with rescue members
7. Test validation prevents staff from being added to teams
8. Test team leader assignment
9. Test member add/remove functionality
