const { getClient } = require('../config/database');

class IncidentClusteringService {
  constructor() {
    this.CLUSTER_RADIUS_METERS = 500;
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
      .not('cluster_id', 'is', null);

    if (error || !existingIncidents || existingIncidents.length === 0) {
      return null;
    }

    for (const incident of existingIncidents) {
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
      console.error('Error creating cluster:', updateError);
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
      console.error('Error adding subscriber:', subscriberError);
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
      console.error('Error adding to cluster:', updateError);
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
      console.error('Error adding subscriber:', subscriberError);
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
      console.error('Error fetching subscribers:', subError);
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
      console.error('Error creating update:', updateError);
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
      console.error('Error fetching cluster updates:', error);
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
      console.error('Error fetching user clusters:', error);
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
      console.error('Error fetching cluster incidents:', incidentsError);
      throw incidentsError;
    }

    const { data: subscribers, error: subscribersError } = await supabase
      .from('incident_cluster_subscribers')
      .select('user_id')
      .eq('cluster_id', clusterId);

    if (subscribersError) {
      console.error('Error fetching cluster subscribers:', subscribersError);
      throw subscribersError;
    }

    const { data: updates, error: updatesError } = await supabase
      .from('incident_updates')
      .select('*')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false });

    if (updatesError) {
      console.error('Error fetching cluster updates:', updatesError);
      throw updatesError;
    }

    return {
      incidents,
      totalReports: incidents.length,
      subscribers: subscribers.length,
      updates: updates || []
    };
  }
}

module.exports = new IncidentClusteringService();
