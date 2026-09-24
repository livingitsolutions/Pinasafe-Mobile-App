
import { apiService } from './apiService';
import { audioAlertService } from './AudioAlertService';

export interface Organization {
  id: string;
  name: string;
  type: 'fire' | 'rescue' ;
  contactInfo: {
    phone: string;
    radio?: string;
    email?: string;
  };
  coverage: string[];
  activePersonnel: OrganizationPersonnel[];
  isActive: boolean;
  lastUpdated: string;
}

export interface OrganizationPersonnel {
  id: string;
  name: string;
  role: string;
  status: 'on_duty' | 'available' | 'off_duty' | 'responding';
  contactInfo: {
    phone: string;
    radio?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  specializations?: string[];
  lastActive: string;
  shiftStart?: string;
  shiftEnd?: string;
}

export interface AlertDispatch {
  id: string;
  emergencyId: string;
  organizationId: string;
  personnelAlerted: string[];
  alertType: 'primary' | 'secondary' | 'backup';
  dispatchedAt: string;
  acknowledgedBy: string[];
  respondingPersonnel: string[];
  status: 'dispatched' | 'acknowledged' | 'responding' | 'completed';
}

// Emergency type to organization mapping
const emergencyOrganizationMapping: Record<string, string[]> = {
  fire: ['bfp-hilongos'],
  rescue: ['drrmo-hilongos'],
  other: ['drrmo-hilongos','bfp-hilongos'],
};

class OrganizationAlertService {
  private organizations: Organization[] = [];
  private activeDispatches: AlertDispatch[] = [];
  private isInitialized = false;

  constructor() {
    this.initializeOrganizations();
  }

  // Load organizations from database
  async initializeOrganizations() {
    if (this.isInitialized) return;

    try {
      const response: any = await apiService.getOrganizations();

      // Adjust for API shape { data: [...] }
      const orgs = response?.data?.data;
      if (Array.isArray(orgs)) {
        this.organizations = orgs.map(org => ({
          id: org.id,
          name: org.name,
          type: org.type,
          contactInfo: { phone: org.phone, email: org.email },
          coverage: org.coverage_areas || [],
          activePersonnel: org.activePersonnel || [],
          isActive: Boolean(org.is_active),
          lastUpdated: org.updated_at,
        }));
        this.isInitialized = true;
        console.log('✅ Organizations loaded from database:', this.organizations);
      } else {
        console.warn('⚠️ No organizations found in API response');
      }
    } catch (error) {
      console.error('❌ Failed to load organizations:', error);
    }
  }

  // Refresh live organizations data
  async refreshOrganizations() {
    this.isInitialized = false;
    await this.initializeOrganizations();
  }

  // Add personnel to organization
  addPersonnel(organizationId: string, personnel: Omit<OrganizationPersonnel, 'lastActive'>): boolean {
    const org = this.organizations.find(o => o.id === organizationId);
    if (!org) return false;

    const newPersonnel: OrganizationPersonnel = {
      ...personnel,
      lastActive: new Date().toISOString(),
    };

    org.activePersonnel.push(newPersonnel);
    org.lastUpdated = new Date().toISOString();
    return true;
  }

  removePersonnel(organizationId: string, personnelId: string): boolean {
    const org = this.organizations.find(o => o.id === organizationId);
    if (!org) return false;

    const index = org.activePersonnel.findIndex(p => p.id === personnelId);
    if (index === -1) return false;

    org.activePersonnel.splice(index, 1);
    org.lastUpdated = new Date().toISOString();
    return true;
  }

  updateOrganizationStatus(organizationId: string, isActive: boolean): boolean {
    const org = this.organizations.find(o => o.id === organizationId);
    if (!org) return false;

    org.isActive = isActive;
    org.lastUpdated = new Date().toISOString();
    return true;
  }

  getResponsibleOrganizations(emergencyType: string): Organization[] {
    if (!this.isInitialized) return [];
    const orgIds = emergencyOrganizationMapping[emergencyType] || emergencyOrganizationMapping['other'];
    return orgIds
      .map(id => this.organizations.find(org => org.id === id))
      .filter((org): org is Organization => org !== undefined);
  }

  getAvailablePersonnel(organizationIds: string[]): OrganizationPersonnel[] {
    const personnel: OrganizationPersonnel[] = [];
    organizationIds.forEach(orgId => {
      const org = this.organizations.find(o => o.id === orgId);
      if (org) {
        const available = org.activePersonnel.filter(p =>
          p.status === 'on_duty' || p.status === 'available'
        );
        personnel.push(...available);
      }
    });

    return personnel.sort((a, b) => {
      if (a.status === 'on_duty' && b.status !== 'on_duty') return -1;
      if (b.status === 'on_duty' && a.status !== 'on_duty') return 1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });
  }

  async dispatchEmergencyAlert(emergencyData: {
    id: string;
    type: string;
    location: string;
    coordinates?: { latitude: number; longitude: number };
    priority: string;
    description: string;
    hasEvidence: boolean;
    aiClassified: boolean;
    aiConfidence?: number;
  }): Promise<AlertDispatch[]> {

    if (!this.isInitialized) await this.initializeOrganizations();

    const responsibleOrgs = this.getResponsibleOrganizations(emergencyData.type);
    const dispatches: AlertDispatch[] = [];

    for (let i = 0; i < responsibleOrgs.length; i++) {
      const org = responsibleOrgs[i];
      if (!org) continue;

      const availablePersonnel = this.getAvailablePersonnel([org.id]);
      if (availablePersonnel.length === 0) continue;

      const dispatch: AlertDispatch = {
        id: `dispatch-${Date.now()}-${i}`,
        emergencyId: emergencyData.id,
        organizationId: org.id,
        personnelAlerted: availablePersonnel.map(p => p.id),
        alertType: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'backup',
        dispatchedAt: new Date().toISOString(),
        acknowledgedBy: [],
        respondingPersonnel: [],
        status: 'dispatched',
      };

      dispatches.push(dispatch);
      this.activeDispatches.push(dispatch);

      await this.sendAlertToPersonnel(org, availablePersonnel, emergencyData, dispatch);
    }

    return dispatches;
  }

  private async sendAlertToPersonnel(
    organization: Organization,
    personnel: OrganizationPersonnel[],
    emergencyData: any,
    dispatch: AlertDispatch
  ): Promise<void> {
    const alertMessage = this.formatAlertMessage(organization, emergencyData);

    audioAlertService.playIncidentAlert(emergencyData.type, emergencyData.priority);

    console.log(`🚨 ALERT DISPATCHED TO ${organization.name.toUpperCase()}`);
    console.log(`📍 Emergency: ${emergencyData.type.toUpperCase()} at ${emergencyData.location}`);
    console.log(`👥 Personnel Alerted: ${personnel.length}`);

    personnel.forEach(person => {
      console.log(`📱 ${person.name} (${person.role}) - ${person.contactInfo.phone}`);
      if (person.contactInfo.radio) console.log(`📻 Radio: ${person.contactInfo.radio}`);
    });

    console.log(`📋 Alert Details: ${alertMessage}`);
    console.log(`🔊 Audio Alert: ${emergencyData.type.toUpperCase()} - ${emergencyData.priority.toUpperCase()} PRIORITY`);
    console.log('─'.repeat(60));

    setTimeout(() => {
      const acknowledging = personnel.slice(0, Math.ceil(personnel.length / 2));
      dispatch.acknowledgedBy = acknowledging.map(p => p.id);
      dispatch.status = 'acknowledged';

      audioAlertService.playAcknowledgment();
      console.log(`✅ ${acknowledging.length} personnel acknowledged alert from ${organization.name}`);
    }, 2000 + Math.random() * 3000);
  }

  private formatAlertMessage(organization: Organization, emergencyData: any): string {
    const evidenceInfo = emergencyData.hasEvidence
      ? `📸 Evidence attached${emergencyData.aiClassified ? ` (AI: ${Math.round(emergencyData.aiConfidence * 100)}% confidence)` : ' (Manual)'}`
      : '📝 Manual report';

    return `🚨 ${emergencyData.type.toUpperCase()} EMERGENCY
📍 Location: ${emergencyData.location}
⚠️ Priority: ${emergencyData.priority.toUpperCase()}
📋 Description: ${emergencyData.description}
${evidenceInfo}
🏢 Dispatched to: ${organization.name}
⏰ Time: ${new Date().toLocaleTimeString()}`;
  }

  getDispatchStatus(emergencyId: string): AlertDispatch[] {
    return this.activeDispatches.filter(d => d.emergencyId === emergencyId);
  }

  updatePersonnelStatus(personnelId: string, status: OrganizationPersonnel['status']): void {
    this.organizations.forEach(org => {
      const person = org.activePersonnel.find(p => p.id === personnelId);
      if (person) {
        person.status = status;
        person.lastActive = new Date().toISOString();
      }
    });
  }

  getOrganizationStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    this.organizations.forEach(org => {
      const personnel = org.activePersonnel || [];

      const onDuty = personnel.filter(p => p.status === 'on_duty').length;
      const available = personnel.filter(p => p.status === 'available').length;
      const responding = personnel.filter(p => p.status === 'responding').length;
      const total = personnel.length;

      const readiness = total > 0 
        ? Math.round(((onDuty + available) / total) * 100) 
        : 0;

      stats[org.id] = {
        id: org.id,
        name: org.name,
        type: org.type,
        onDuty,
        available,
        responding,
        total,
        readiness,
      };
    });

    return stats;
  }

  getAllOrganizations(): Organization[] {
    return this.organizations;
  }

  getOrganization(id: string): Organization | undefined {
    return this.organizations.find(org => org.id === id);
  }
}

export const organizationAlertService = new OrganizationAlertService();
