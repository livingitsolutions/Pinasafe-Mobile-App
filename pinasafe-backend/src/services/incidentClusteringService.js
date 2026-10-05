const { getClient } = require('../config/database');
const safeLogger = require('../utils/safeLogger');
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const REPORT_STATUSES = new Set(['pending', 'dispatched', 'responding', 'resolved']);
const STATUS_ORDER = { pending: 0, dispatched: 1, responding: 2 };
const PRIORITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

class IncidentClusteringService {
  constructor() {
    this.CLUSTER_RADIUS_METERS = 500;
  }

  normalizeCoordinate(value, minimum, maximum) {
    let coordinate;

    if (typeof value === 'number') {
      coordinate = value;
    } else if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue || !DECIMAL_NUMBER_PATTERN.test(trimmedValue)) return null;
      coordinate = Number(trimmedValue);
    } else {
      return null;
    }

    return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
      ? coordinate
      : null;
  }

  getCoordinates(incident) {
    const latitude = this.normalizeCoordinate(incident.latitude, -90, 90);
    const longitude = this.normalizeCoordinate(incident.longitude, -180, 180);

    return latitude !== null && longitude !== null
      ? { latitude, longitude }
      : null;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
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

  isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  shouldCluster(incident1, incident2) {
    if (incident1.type !== incident2.type) return false;
    if (!this.isSameDay(incident1.created_at, incident2.created_at)) return false;

    if (incident1.latitude && incident1.longitude && incident2.latitude && incident2.longitude) {
      const distance = this.calculateDistance(
        parseFloat(incident1.latitude),
        parseFloat(incident1.longitude),
        parseFloat(incident2.latitude),
        parseFloat(incident2.longitude)
      );
      return distance <= this.CLUSTER_RADIUS_METERS;
    }

    return (
      incident1.location.toLowerCase().includes(incident2.location.toLowerCase()) ||
      incident2.location.toLowerCase().includes(incident1.location.toLowerCase())
    );
  }

  async findMatchingCluster(newIncident) {
    const supabase = getClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: existingIncidents, error } = await supabase
      .from('emergency_reports')
      .select('*')
      .eq('type', newIncident.type)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString())
      .neq('id', newIncident.id)
      .neq('status', 'resolved')
      .not('cluster_id', 'is', null);

    if (error) {
      safeLogger.error('clustering.candidates_fetch_failed');
      throw error;
    }

    if (!existingIncidents || existingIncidents.length === 0) {
      return null;
    }

    for (const incident of existingIncidents.filter((item) => item.status !== 'resolved')) {
      if (this.shouldCluster(newIncident, incident)) {
        return incident.cluster_id;
      }
    }

    return null;
  }

  async createCluster(primaryIncidentId, userId) {
    const supabase = getClient();

    const { error: updateError } = await supabase
      .from('emergency_reports')
      .update({ cluster_id: primaryIncidentId })
      .eq('id', primaryIncidentId);

    if (updateError) {
      safeLogger.error('clustering.cluster_create_failed');
      throw updateError;
    }

    const { error: subscriberError } = await supabase
      .from('incident_cluster_subscribers')
      .insert({
        cluster_id: primaryIncidentId,
        user_id: userId,
        incident_id: primaryIncidentId
      });

    if (subscriberError) {
      safeLogger.error('clustering.subscriber_add_failed');
      throw subscriberError;
    }

    return primaryIncidentId;
  }

  async addToCluster(clusterId, incidentId, userId) {
    const supabase = getClient();

    const { error: updateError } = await supabase
      .from('emergency_reports')
      .update({ cluster_id: clusterId })
      .eq('id', incidentId);

    if (updateError) {
      safeLogger.error('clustering.cluster_add_failed');
      throw updateError;
    }

    const { error: subscriberError } = await supabase
      .from('incident_cluster_subscribers')
      .insert({
        cluster_id: clusterId,
        user_id: userId,
        incident_id: incidentId
      });

    if (subscriberError && subscriberError.code !== '23505') {
      safeLogger.error('clustering.subscriber_add_failed');
      throw subscriberError;
    }

    return clusterId;
  }

  async notifyClusterSubscribers(clusterId, message, status, responderId) {
    const supabase = getClient();

    const { data: subscribers, error: subError } = await supabase
      .from('incident_cluster_subscribers')
      .select('user_id')
      .eq('cluster_id', clusterId);

    if (subError) {
      safeLogger.error('clustering.subscribers_fetch_failed');
      throw subError;
    }

    const { data: update, error: updateError } = await supabase
      .from('incident_updates')
      .insert({
        cluster_id: clusterId,
        responder_id: responderId,
        message,
        status
      })
      .select()
      .single();

    if (updateError) {
      safeLogger.error('clustering.update_create_failed');
      throw updateError;
    }

    return {
      update,
      notifiedUsers: subscribers.map(s => s.user_id)
    };
  }

  async getClusterUpdates(clusterId) {
    const supabase = getClient();

    const { data: updates, error } = await supabase
      .from('incident_updates')
      .select(`
        *,
        responder:users!responder_id(name, role)
      `)
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false });

    if (error) {
      safeLogger.error('clustering.updates_fetch_failed');
      throw error;
    }

    return updates;
  }

  async getUserClusters(userId) {
    const supabase = getClient();

    const { data: subscriptions, error } = await supabase
      .from('incident_cluster_subscribers')
      .select(`
        cluster_id,
        incident_id,
        subscribed_at,
        incident:emergency_reports!incident_id(*)
      `)
      .eq('user_id', userId);

    if (error) {
      safeLogger.error('clustering.user_clusters_fetch_failed');
      throw error;
    }

    return subscriptions;
  }

  async getClusterInfo(clusterId) {
    const supabase = getClient();

    const { data: incidents, error: incidentsError } = await supabase
      .from('emergency_reports')
      .select(`
        *,
        reporter:users!reported_by(name, phone)
      `)
      .eq('cluster_id', clusterId);

    if (incidentsError) {
      safeLogger.error('clustering.incidents_fetch_failed');
      throw incidentsError;
    }

    const { data: subscribers, error: subscribersError } = await supabase
      .from('incident_cluster_subscribers')
      .select('user_id')
      .eq('cluster_id', clusterId);

    if (subscribersError) {
      safeLogger.error('clustering.subscribers_fetch_failed');
      throw subscribersError;
    }

    const { data: updates, error: updatesError } = await supabase
      .from('incident_updates')
      .select('*')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false });

    if (updatesError) {
      safeLogger.error('clustering.updates_fetch_failed');
      throw updatesError;
    }

    const legacyIncidents = incidents || [];
    const memberReports = [...legacyIncidents].sort((left, right) => {
      const createdAtOrder = String(left.created_at).localeCompare(String(right.created_at));
      return createdAtOrder || String(left.id).localeCompare(String(right.id));
    });
    const anchor = memberReports.find((incident) => incident.id === clusterId);
    const representative = anchor || memberReports[0];
    const canonicalIncident = (anchor && this.getCoordinates(anchor) ? anchor : null)
      || memberReports.find((incident) => this.getCoordinates(incident))
      || representative;
    // Unknown lifecycle values count as pending; any active member keeps the cluster active.
    const effectiveStatuses = memberReports.map((incident) => (
      REPORT_STATUSES.has(incident.status) ? incident.status : 'pending'
    ));
    const activeStatuses = effectiveStatuses.filter((status) => status !== 'resolved');
    const operationalStatus = memberReports.length > 0
      && effectiveStatuses.every((status) => status === 'resolved')
      ? 'resolved'
      : activeStatuses.reduce((highest, status) => (
        STATUS_ORDER[status] > STATUS_ORDER[highest] ? status : highest
      ), 'pending');
    const priorities = memberReports
      .map((incident) => incident.priority)
      .filter((priority) => Object.hasOwn(PRIORITY_ORDER, priority));
    const priority = priorities.reduce((highest, current) => (
      PRIORITY_ORDER[current] > (PRIORITY_ORDER[highest] ?? -1) ? current : highest
    ), null);
    const reportTimes = memberReports
      .map((incident) => incident.created_at)
      .filter((createdAt) => createdAt && Number.isFinite(Date.parse(createdAt)))
      .map((createdAt) => ({ value: createdAt, time: Date.parse(createdAt) }))
      .sort((left, right) => left.time - right.time);
    const distinctReporterCount = new Set(
      memberReports.map((incident) => incident.reported_by).filter(Boolean)
    ).size;
    const canonicalCoordinates = canonicalIncident
      ? this.getCoordinates(canonicalIncident)
      : null;
    const operationalMemberReports = memberReports.map((incident) => ({
      id: incident.id,
      organization_id: incident.organization_id,
      assigned_team_id: incident.assigned_team_id,
      type: incident.type,
      description: incident.description,
      latitude: incident.latitude,
      longitude: incident.longitude,
      priority: incident.priority,
      status: incident.status,
      created_at: incident.created_at,
      coordinates: this.getCoordinates(incident)
    }));
    const usableLocation = (location) => (
      typeof location === 'string'
      && location.trim().length > 0
      && location.trim().toLowerCase() !== 'unknown location'
    );
    const representativeLocation = usableLocation(anchor?.location)
      ? anchor.location
      : memberReports.find((incident) => usableLocation(incident.location))?.location || null;

    return {
      clusterId,
      type: representative?.type || null,
      status: operationalStatus,
      location: representativeLocation,
      latitude: canonicalCoordinates?.latitude ?? null,
      longitude: canonicalCoordinates?.longitude ?? null,
      coordinates: canonicalCoordinates,
      firstReportedAt: reportTimes[0]?.value || null,
      latestReportedAt: reportTimes[reportTimes.length - 1]?.value || null,
      reportCount: memberReports.length,
      distinctReporterCount,
      priority,
      assignedTeams: [...new Map(
        memberReports
          .map((incident) => incident.assigned_team_id)
          .filter(Boolean)
          .map((teamId) => [teamId, { id: teamId }])
      ).values()],
      memberReports: operationalMemberReports,
      incidents: legacyIncidents,
      totalReports: memberReports.length,
      subscribers: subscribers.length,
      updates: updates || []
    };
  }
}

module.exports = new IncidentClusteringService();
