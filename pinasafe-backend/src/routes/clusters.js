const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateUUID, validateClusterUpdate } = require('../middleware/validation');
const clusteringService = require('../services/incidentClusteringService');
const safeLogger = require('../utils/safeLogger');

const router = express.Router();

const getClusterAccessScope = async (clusterId, user) => {
  const supabase = getClient();
  let reportsQuery = supabase
    .from('emergency_reports')
    .select('id, organization_id, reported_by')
    .eq('cluster_id', clusterId);

  if (user.role === 'citizen') {
    reportsQuery = reportsQuery.eq('reported_by', user.id);
  } else {
    if (!user.organization_id) {
      return { error: 'User not assigned to an organization', status: 400 };
    }
    reportsQuery = reportsQuery.eq('organization_id', user.organization_id);
  }

  const { data: reports, error: reportsError } = await reportsQuery;
  if (reportsError) throw reportsError;
  const authorizedReports = (reports || []).filter((report) => (
    user.role === 'citizen'
      ? report.reported_by === user.id
      : report.organization_id === user.organization_id
  ));
  if (!authorizedReports.length) {
    return {
      error: user.role === 'citizen'
        ? 'Access denied to this cluster'
        : 'Access denied for this organization',
      status: 403
    };
  }

  if (user.role === 'citizen') {
    const { data: subscription, error: subscriptionError } = await supabase
      .from('incident_cluster_subscribers')
      .select('user_id, incident_id')
      .eq('cluster_id', clusterId)
      .eq('user_id', user.id)
      .in('incident_id', authorizedReports.map((report) => report.id))
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (
      !subscription
      || subscription.user_id !== user.id
      || !authorizedReports.some((report) => report.id === subscription.incident_id)
    ) {
      return { error: 'Access denied to this cluster', status: 403 };
    }
    return { scope: { userId: user.id } };
  }

  return { scope: { organizationId: user.organization_id } };
};

router.get('/my-clusters', authenticateToken, async (req, res) => {
  try {
    const clusters = await clusteringService.getUserClusters(req.user.id);

    const clustersWithInfo = await Promise.all(
      clusters.map(async (sub) => {
        const info = await clusteringService.getClusterInfo(sub.cluster_id, {
          userId: req.user.id
        });
        return {
          cluster_id: sub.cluster_id,
          subscribed_at: sub.subscribed_at,
          my_incident_id: sub.incident_id,
          ...info
        };
      })
    );

    res.json({ data: clustersWithInfo });
  } catch (error) {
    safeLogger.error('clusters.user_list_failed');
    res.status(500).json({ error: 'Failed to fetch user clusters' });
  }
});

router.get('/operational', authenticateToken, requireRole(['admin', 'responder']), async (req, res) => {
  try {
    const { user } = req;

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const operationalClusters = await clusteringService.getOperationalClusters(user.organization_id);
    res.json({ data: operationalClusters });
  } catch (error) {
    safeLogger.error('clusters.operational_list_failed');
    res.status(500).json({ error: 'Failed to fetch operational incidents' });
  }
});

router.post('/operational/:operationalId/acknowledge', authenticateToken, requireRole(['admin']), validateUUID('operationalId'), async (req, res) => {
  try {
    const { user } = req;

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const result = await clusteringService.acknowledgeOperationalIncident(
      user.organization_id,
      req.params.operationalId,
      user.id
    );
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Operational incident not found' });
    }
    if (result.status === 'not_acknowledgeable') {
      return res.status(409).json({ error: 'Operational incident is not an active corroborated alert' });
    }

    return res.json({
      data: {
        operationalId: req.params.operationalId,
        acknowledged: true
      }
    });
  } catch (error) {
    safeLogger.error('clusters.operational_acknowledgement_failed');
    return res.status(500).json({ error: 'Failed to acknowledge operational incident' });
  }
});

router.get('/:clusterId/info', authenticateToken, validateUUID('clusterId'), async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { user } = req;

    const access = await getClusterAccessScope(clusterId, user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const clusterInfo = await clusteringService.getClusterInfo(clusterId, access.scope);
    res.json({ data: clusterInfo });
  } catch (error) {
    safeLogger.error('clusters.info_failed');
    res.status(500).json({ error: 'Failed to fetch cluster information' });
  }
});

router.get('/:clusterId/updates', authenticateToken, validateUUID('clusterId'), async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { user } = req;

    const access = await getClusterAccessScope(clusterId, user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const updates = await clusteringService.getClusterUpdates(clusterId, access.scope);
    res.json({ data: updates });
  } catch (error) {
    safeLogger.error('clusters.updates_failed');
    res.status(500).json({ error: 'Failed to fetch cluster updates' });
  }
});

router.post('/:clusterId/updates', authenticateToken, requireRole(['responder', 'admin']), validateUUID('clusterId'), validateClusterUpdate, async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { message, status } = req.body;
    const { user } = req;

    if (!message || !status) {
      return res.status(400).json({ error: 'Message and status are required' });
    }

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const validStatuses = ['pending', 'dispatched', 'responding', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const access = await getClusterAccessScope(clusterId, user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const result = await clusteringService.notifyClusterSubscribers(
      clusterId,
      message,
      status,
      user.id,
      user.organization_id
    );

    res.status(201).json({
      message: 'Cluster update sent successfully',
      data: {
        update: result.update,
        notifiedUsers: result.notifiedUsers.length
      }
    });
  } catch (error) {
    safeLogger.error('clusters.update_create_failed');
    res.status(500).json({ error: 'Failed to create cluster update' });
  }
});

router.get('/statistics', authenticateToken, requireRole(['responder', 'admin']), async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayIncidents, error } = await supabase
      .from('emergency_reports')
      .select('*')
      .eq('organization_id', user.organization_id)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      throw error;
    }

    const clusteredIncidents = todayIncidents.filter(i => i.cluster_id);
    const uniqueClusters = [...new Set(clusteredIncidents.map(i => i.cluster_id))];

    const clusterStats = {
      totalIncidentsToday: todayIncidents.length,
      clusteredIncidents: clusteredIncidents.length,
      uniqueClusters: uniqueClusters.length,
      averageIncidentsPerCluster: uniqueClusters.length > 0
        ? (clusteredIncidents.length / uniqueClusters.length).toFixed(2)
        : 0
    };

    res.json({ data: clusterStats });
  } catch (error) {
    safeLogger.error('clusters.statistics_failed');
    res.status(500).json({ error: 'Failed to fetch cluster statistics' });
  }
});

module.exports = router;
