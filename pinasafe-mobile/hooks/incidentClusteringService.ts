// export interface ClusteredIncident {
//   id: string;
//   primaryIncident: any;
//   relatedIncidents: any[];
//   totalReports: number;
//   location: string;
//   coordinates?: { latitude: number; longitude: number };
//   type: string;
//   priority: 'low' | 'medium' | 'high' | 'critical';
//   status: 'pending' | 'dispatched' | 'responding' | 'resolved';
//   reportedAt: string;
//   lastUpdated: string;
//   clusterRadius: number;
//   affectedArea: string;
// }

// class IncidentClusteringService {
//   private readonly CLUSTER_RADIUS_METERS = 500;
//   private readonly SAME_DAY_THRESHOLD_HOURS = 24;

//   // Calculate distance between two coordinates using Haversine formula
//   private calculateDistance(
//     lat1: number,
//     lon1: number,
//     lat2: number,
//     lon2: number
//   ): number {
//     const R = 6371000; // Earth's radius in meters
//     const dLat = this.toRadians(lat2 - lat1);
//     const dLon = this.toRadians(lon2 - lon1);
//     const a =
//       Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//       Math.cos(this.toRadians(lat1)) *
//         Math.cos(this.toRadians(lat2)) *
//         Math.sin(dLon / 2) *
//         Math.sin(dLon / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     return R * c;
//   }

//   private toRadians(degrees: number): number {
//     return degrees * (Math.PI / 180);
//   }

//   // Check if two incidents are within the same day
//   private isSameDay(date1: string, date2: string): boolean {
//     const d1 = new Date(date1);
//     const d2 = new Date(date2);
    
//     return (
//       d1.getFullYear() === d2.getFullYear() &&
//       d1.getMonth() === d2.getMonth() &&
//       d1.getDate() === d2.getDate()
//     );
//   }

//   // Check if two incidents are within clustering criteria
//   private shouldCluster(incident1: any, incident2: any): boolean {
//     // Must be same incident type
//     if (incident1.type !== incident2.type) {
//       return false;
//     }

//     // Must be same day
//     if (!this.isSameDay(incident1.reportedAt, incident2.reportedAt)) {
//       return false;
//     }

//     // Must have coordinates for both incidents
//     if (!incident1.coordinates || !incident2.coordinates) {
//       // Fallback to location string matching if no coordinates
//       return incident1.location.toLowerCase().includes(incident2.location.toLowerCase()) ||
//              incident2.location.toLowerCase().includes(incident1.location.toLowerCase());
//     }

//     // Calculate distance
//     const distance = this.calculateDistance(
//       incident1.coordinates.latitude,
//       incident1.coordinates.longitude,
//       incident2.coordinates.latitude,
//       incident2.coordinates.longitude
//     );

//     return distance <= this.CLUSTER_RADIUS_METERS;
//   }

//   // Get the highest priority from a group of incidents
//   private getHighestPriority(incidents: any[]): 'low' | 'medium' | 'high' | 'critical' {
//     const priorityOrder = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    
//     let highestPriority = 'low';
//     let highestValue = 0;

//     incidents.forEach(incident => {
//       const value = priorityOrder[incident.priority as keyof typeof priorityOrder] || 0;
//       if (value > highestValue) {
//         highestValue = value;
//         highestPriority = incident.priority;
//       }
//     });

//     return highestPriority as 'low' | 'medium' | 'high' | 'critical';
//   }

//   // Get the most critical status from a group of incidents
//   private getMostCriticalStatus(incidents: any[]): 'pending' | 'dispatched' | 'responding' | 'resolved' {
//     const statusOrder = { 'resolved': 1, 'responding': 2, 'dispatched': 3, 'pending': 4 };
    
//     let mostCriticalStatus = 'resolved';
//     let highestValue = 0;

//     incidents.forEach(incident => {
//       const value = statusOrder[incident.status as keyof typeof statusOrder] || 0;
//       if (value > highestValue) {
//         highestValue = value;
//         mostCriticalStatus = incident.status;
//       }
//     });

//     return mostCriticalStatus as 'pending' | 'dispatched' | 'responding' | 'resolved';
//   }

//   // Generate cluster area description
//   private generateAffectedArea(incidents: any[]): string {
//     const locations = incidents.map(i => i.location);
//     const uniqueLocations = [...new Set(locations)];
    
//     if (uniqueLocations.length === 1) {
//       return uniqueLocations[0];
//     } else if (uniqueLocations.length <= 3) {
//       return uniqueLocations.join(', ');
//     } else {
//       return `${uniqueLocations.slice(0, 2).join(', ')} and ${uniqueLocations.length - 2} other areas`;
//     }
//   }

//   // Main clustering function
//   clusterIncidents(incidents: any[]): ClusteredIncident[] {

//     if (!Array.isArray(incidents) || incidents.length === 0) {
//       return [];
//     }
    
//     const clusters: ClusteredIncident[] = [];
//     const processed = new Set<string>();

//     incidents.forEach(incident => {
//       if (processed.has(incident.id)) {
//         return;
//       }

//       // Find all incidents that should be clustered with this one
//       const relatedIncidents = incidents.filter(other => 
//         other.id !== incident.id && 
//         !processed.has(other.id) && 
//         this.shouldCluster(incident, other)
//       );

//       // Create cluster
//       const allIncidents = [incident, ...relatedIncidents];
//       const primaryIncident = allIncidents.reduce((latest, current) => 
//         new Date(current.reportedAt) > new Date(latest.reportedAt) ? current : latest
//       );

//       const cluster: ClusteredIncident = {
//         id: `cluster-${incident.id}`,
//         primaryIncident,
//         relatedIncidents: allIncidents.filter(i => i.id !== primaryIncident.id),
//         totalReports: allIncidents.length,
//         location: primaryIncident.location,
//         coordinates: primaryIncident.coordinates,
//         type: primaryIncident.type,
//         priority: this.getHighestPriority(allIncidents),
//         status: this.getMostCriticalStatus(allIncidents),
//         reportedAt: allIncidents.reduce((earliest, current) => 
//           new Date(current.reportedAt) < new Date(earliest.reportedAt) ? current : earliest
//         ).reportedAt,
//         lastUpdated: allIncidents.reduce((latest, current) => 
//           new Date(current.reportedAt) > new Date(latest.reportedAt) ? current : latest
//         ).reportedAt,
//         clusterRadius: this.CLUSTER_RADIUS_METERS,
//         affectedArea: this.generateAffectedArea(allIncidents),
//       };

//       clusters.push(cluster);

//       // Mark all incidents in this cluster as processed
//       allIncidents.forEach(i => processed.add(i.id));
//     });

//     return clusters.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
//   }

//   // Get cluster statistics
//   getClusterStatistics(clusters: ClusteredIncident[]): {
//     totalClusters: number;
//     totalIncidents: number;
//     averageIncidentsPerCluster: number;
//     largestCluster: number;
//     clustersByPriority: Record<string, number>;
//     clustersByStatus: Record<string, number>;
//   } {
//     const totalIncidents = clusters.reduce((sum, cluster) => sum + cluster.totalReports, 0);
//     const largestCluster = Math.max(...clusters.map(c => c.totalReports), 0);
    
//     const clustersByPriority: Record<string, number> = {};
//     const clustersByStatus: Record<string, number> = {};

//     clusters.forEach(cluster => {
//       clustersByPriority[cluster.priority] = (clustersByPriority[cluster.priority] || 0) + 1;
//       clustersByStatus[cluster.status] = (clustersByStatus[cluster.status] || 0) + 1;
//     });

//     return {
//       totalClusters: clusters.length,
//       totalIncidents,
//       averageIncidentsPerCluster: clusters.length > 0 ? totalIncidents / clusters.length : 0,
//       largestCluster,
//       clustersByPriority,
//       clustersByStatus,
//     };
//   }

//   // Check if a new incident should be added to an existing cluster
//   findMatchingCluster(newIncident: any, existingClusters: ClusteredIncident[]): ClusteredIncident | null {
//     for (const cluster of existingClusters) {
//       // Check type match first, then other criteria
//       if (newIncident.type === cluster.type && this.shouldCluster(newIncident, cluster.primaryIncident)) {
//         return cluster;
//       }
//     }
//     return null;
//   }

//   // Add incident to existing cluster
//   addToCluster(incident: any, cluster: ClusteredIncident): ClusteredIncident {
//     const allIncidents = [cluster.primaryIncident, ...cluster.relatedIncidents, incident];
    
//     return {
//       ...cluster,
//       relatedIncidents: allIncidents.filter(i => i.id !== cluster.primaryIncident.id),
//       totalReports: allIncidents.length,
//       priority: this.getHighestPriority(allIncidents),
//       status: this.getMostCriticalStatus(allIncidents),
//       lastUpdated: new Date().toISOString(),
//       affectedArea: this.generateAffectedArea(allIncidents),
//     };
//   }

//   // Format cluster for display
//   formatClusterForDisplay(cluster: ClusteredIncident): {
//     title: string;
//     description: string;
//     badge: string;
//     details: string[];
//   } {
//     const typeEmoji = {
//       fire: '🔥',
//       medical: '🚑',
//       accident: '🚗',
//       crime: '🚔',
//       natural: '🌊',
//       other: '⚠️',
//     };

//     const title = cluster.totalReports > 1 
//       ? `${typeEmoji[cluster.type as keyof typeof typeEmoji] || '⚠️'} ${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} Emergency Cluster`
//       : `${typeEmoji[cluster.type as keyof typeof typeEmoji] || '⚠️'} ${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} Emergency`;

//     const description = cluster.totalReports > 1
//       ? `${cluster.totalReports} related ${cluster.type} incidents in ${cluster.affectedArea}`
//       : cluster.primaryIncident.description;

//     const badge = cluster.totalReports > 1 ? `${cluster.totalReports} ${cluster.type} reports` : `Single ${cluster.type}`;

//     const details = [
//       `Location: ${cluster.affectedArea}`,
//       `Type: ${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} Emergency`,
//       `Priority: ${cluster.priority.charAt(0).toUpperCase() + cluster.priority.slice(1)}`,
//       `Status: ${cluster.status.charAt(0).toUpperCase() + cluster.status.slice(1)}`,
//       `First reported: ${new Date(cluster.reportedAt).toLocaleString()}`,
//     ];

//     if (cluster.totalReports > 1) {
//       details.push(`Last update: ${new Date(cluster.lastUpdated).toLocaleString()}`);
//       details.push(`Cluster radius: ${cluster.clusterRadius}m`);
//     }

//     return { title, description, badge, details };
//   }
// }

// export const incidentClusteringService = new IncidentClusteringService();

export interface ClusteredIncident {
  id: string;
  primaryIncident: any;
  relatedIncidents: any[];
  totalReports: number;
  location: string;
  coordinates?: { latitude: number; longitude: number };
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'dispatched' | 'responding' | 'resolved';
  reportedAt: string;
  lastUpdated: string;
  clusterRadius: number;
  affectedArea: string;
}

class IncidentClusteringService {
  private readonly CLUSTER_RADIUS_METERS = 500;

  // Convert degrees to radians
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Haversine formula to calculate distance between coordinates
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Check if two incidents were reported on the same day
  private isSameDay(date1: string, date2: string): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  // Determine if two incidents should cluster
  private shouldCluster(incident1: any, incident2: any): boolean {
    if (incident1.type !== incident2.type) return false;
    if (!this.isSameDay(incident1.reportedAt, incident2.reportedAt)) return false;

    if (incident1.coordinates && incident2.coordinates) {
      const distance = this.calculateDistance(
        incident1.coordinates.latitude,
        incident1.coordinates.longitude,
        incident2.coordinates.latitude,
        incident2.coordinates.longitude
      );
      return distance <= this.CLUSTER_RADIUS_METERS;
    }

    return (
      incident1.location.toLowerCase().includes(incident2.location.toLowerCase()) ||
      incident2.location.toLowerCase().includes(incident1.location.toLowerCase())
    );
  }

  // Get highest priority among incidents
  private getHighestPriority(incidents: any[]): 'low' | 'medium' | 'high' | 'critical' {
    const priorityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    let highest: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let max = 0;
    incidents.forEach((i) => {
      const val = priorityOrder[i.priority as keyof typeof priorityOrder] || 0;
      if (val > max) {
        max = val;
        highest = i.priority;
      }
    });
    return highest;
  }

  // Get most critical status among incidents
  private getMostCriticalStatus(
    incidents: any[]
  ): 'pending' | 'dispatched' | 'responding' | 'resolved' {
    const statusOrder = { pending: 4, dispatched: 3, responding: 2, resolved: 1 };
    let highest: 'pending' | 'dispatched' | 'responding' | 'resolved' = 'resolved';
    let max = 0;
    incidents.forEach((i) => {
      const val = statusOrder[i.status as keyof typeof statusOrder] || 0;
      if (val > max) {
        max = val;
        highest = i.status;
      }
    });
    return highest;
  }

  // Generate affected area description
  private generateAffectedArea(incidents: any[]): string {
    const uniqueLocations = [...new Set(incidents.map((i) => i.location))];
    if (uniqueLocations.length === 1) return uniqueLocations[0];
    if (uniqueLocations.length <= 3) return uniqueLocations.join(', ');
    return `${uniqueLocations.slice(0, 2).join(', ')} and ${
      uniqueLocations.length - 2
    } other areas`;
  }

  // Cluster incidents
  clusterIncidents(incidents: any[]): ClusteredIncident[] {
    if (!Array.isArray(incidents) || incidents.length === 0) return [];

    const clusters: ClusteredIncident[] = [];
    const processed = new Set<string>();

    incidents.forEach((incident) => {
      if (processed.has(incident.id)) return;

      // Find related incidents
      const relatedIncidents = incidents.filter(
        (other) =>
          other.id !== incident.id &&
          !processed.has(other.id) &&
          this.shouldCluster(incident, other)
      );

      const allIncidents = [incident, ...relatedIncidents];

      const primaryIncident = allIncidents.reduce((latest, current) =>
        new Date(current.reportedAt) > new Date(latest.reportedAt) ? current : latest
      );

      const cluster: ClusteredIncident = {
        id: `${incident.id}`,
        primaryIncident,
        relatedIncidents: allIncidents.filter((i) => i.id !== primaryIncident.id),
        totalReports: allIncidents.length,
        location: primaryIncident.location,
        coordinates: primaryIncident.coordinates,
        type: primaryIncident.type,
        priority: this.getHighestPriority(allIncidents),
        status: this.getMostCriticalStatus(allIncidents),
        reportedAt: allIncidents.reduce((earliest, current) =>
          new Date(current.reportedAt) < new Date(earliest.reportedAt) ? current : earliest
        ).reportedAt,
        lastUpdated: allIncidents.reduce((latest, current) =>
          new Date(current.reportedAt) > new Date(latest.reportedAt) ? current : latest
        ).reportedAt,
        clusterRadius: this.CLUSTER_RADIUS_METERS,
        affectedArea: this.generateAffectedArea(allIncidents),
      };

      clusters.push(cluster);
      allIncidents.forEach((i) => processed.add(i.id));
    });

    return clusters.sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
  }

  // Cluster statistics
  getClusterStatistics(clusters: ClusteredIncident[]) {
    const totalIncidents = clusters.reduce((sum, c) => sum + c.totalReports, 0);
    const largestCluster = Math.max(...clusters.map((c) => c.totalReports), 0);

    const clustersByPriority: Record<string, number> = {};
    const clustersByStatus: Record<string, number> = {};

    clusters.forEach((c) => {
      clustersByPriority[c.priority] = (clustersByPriority[c.priority] || 0) + 1;
      clustersByStatus[c.status] = (clustersByStatus[c.status] || 0) + 1;
    });

    const activeClusters = clusters.filter((c) => c.status !== 'resolved').length;
    const readinessRate =
      clusters.length > 0 ? (activeClusters / clusters.length) * 100 : 0;

    return {
      totalClusters: clusters.length,
      totalIncidents,
      averageIncidentsPerCluster: clusters.length > 0 ? totalIncidents / clusters.length : 0,
      largestCluster,
      clustersByPriority,
      clustersByStatus,
      activeClusters,
      readinessRate,
    };
  }

  // Find a cluster that matches a new incident
  findMatchingCluster(
    newIncident: any,
    existingClusters: ClusteredIncident[]
  ): ClusteredIncident | null {
    return (
      existingClusters.find((cluster) =>
        newIncident.type === cluster.type &&
        this.shouldCluster(newIncident, cluster.primaryIncident)
      ) || null
    );
  }

  // Add incident to existing cluster
  addToCluster(incident: any, cluster: ClusteredIncident): ClusteredIncident {
    const allIncidents = [cluster.primaryIncident, ...cluster.relatedIncidents, incident];
    const primaryIncident = allIncidents.reduce((latest, current) =>
      new Date(current.reportedAt) > new Date(latest.reportedAt) ? current : latest
    );

    return {
      ...cluster,
      primaryIncident,
      relatedIncidents: allIncidents.filter((i) => i.id !== primaryIncident.id),
      totalReports: allIncidents.length,
      priority: this.getHighestPriority(allIncidents),
      status: this.getMostCriticalStatus(allIncidents),
      lastUpdated: new Date().toISOString(),
      affectedArea: this.generateAffectedArea(allIncidents),
    };
  }

  // Format cluster for display
  formatClusterForDisplay(cluster: ClusteredIncident) {
    const typeEmoji = {
      fire: '🔥',
      medical: '🚑',
      accident: '🚗',
      crime: '🚔',
      natural: '🌊',
      other: '⚠️',
    };

    const title =
      cluster.totalReports > 1
        ? `${typeEmoji[cluster.type as keyof typeof typeEmoji] || '⚠️'} ${
            cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)
          } Emergency Cluster`
        : `${typeEmoji[cluster.type as keyof typeof typeEmoji] || '⚠️'} ${
            cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)
          } Emergency`;

    const description =
      cluster.totalReports > 1
        ? `${cluster.totalReports} related ${cluster.type} incidents in ${cluster.affectedArea}`
        : cluster.primaryIncident.description;

    const badge =
      cluster.totalReports > 1
        ? `${cluster.totalReports} ${cluster.type} reports`
        : `Single ${cluster.type}`;

    const details = [
      `Location: ${cluster.affectedArea}`,
      `Type: ${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} Emergency`,
      `Priority: ${cluster.priority.charAt(0).toUpperCase() + cluster.priority.slice(1)}`,
      `Status: ${cluster.status.charAt(0).toUpperCase() + cluster.status.slice(1)}`,
      `First reported: ${new Date(cluster.reportedAt).toLocaleString()}`,
    ];

    if (cluster.totalReports > 1) {
      details.push(`Last update: ${new Date(cluster.lastUpdated).toLocaleString()}`);
      details.push(`Cluster radius: ${cluster.clusterRadius}m`);
    }

    return { title, description, badge, details };
  }
}

export const incidentClusteringService = new IncidentClusteringService();
