const express = require('express');
const { getClient } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/emergency', authenticateToken, requireRole(['responder', 'admin']), async (req, res) => {
  try {
    const { user } = req;
    const supabase = getClient();

    if (!user.organization_id) {
      return res.status(400).json({ error: 'User not assigned to an organization' });
    }

    const { count: totalReports } = await supabase
      .from('emergency_reports')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id);

    const { count: activeIncidents } = await supabase
      .from('emergency_reports')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id)
      .in('status', ['pending', 'dispatched', 'responding']);

    const today = new Date().toISOString().split('T')[0];
    const { count: resolvedToday } = await supabase
      .from('emergency_reports')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id)
      .eq('status', 'resolved')
      .gte('resolved_at', today);

    const { data: responseTimeData } = await supabase
      .from('emergency_reports')
      .select('created_at, resolved_at')
      .eq('organization_id', user.organization_id)
      .eq('status', 'resolved')
      .not('resolved_at', 'is', null)
      .limit(100);

    let avgMinutes = 0;
    if (responseTimeData && responseTimeData.length > 0) {
      const totalMinutes = responseTimeData.reduce((sum, report) => {
        const created = new Date(report.created_at);
        const resolved = new Date(report.resolved_at);
        const minutes = (resolved - created) / (1000 * 60);
        return sum + minutes;
      }, 0);
      avgMinutes = totalMinutes / responseTimeData.length;
    }

    const averageResponseTime = avgMinutes > 0 ? `${Math.round(avgMinutes)}m` : '0m';

    res.json({
      data: {
        totalReports: totalReports || 0,
        activeIncidents: activeIncidents || 0,
        resolvedToday: resolvedToday || 0,
        averageResponseTime
      }
    });

  } catch (error) {
    console.error('Get emergency stats error:', error);
    res.status(500).json({ error: 'Failed to fetch emergency statistics' });
  }
});

router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = getClient();

    const { count: totalReports } = await supabase
      .from('emergency_reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_by', userId);

    const { count: activeReports } = await supabase
      .from('emergency_reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_by', userId)
      .in('status', ['pending', 'dispatched', 'responding']);

    const { count: totalCalls } = await supabase
      .from('emergency_calls')
      .select('*', { count: 'exact', head: true })
      .eq('caller_id', userId);

    const { data: lastActivityData } = await supabase
      .from('emergency_reports')
      .select('created_at')
      .eq('reported_by', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      data: {
        totalReports: totalReports || 0,
        activeReports: activeReports || 0,
        totalCalls: totalCalls || 0,
        lastActivity: lastActivityData?.created_at || null
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

router.get('/system', authenticateToken, async (req, res) => {
  res.status(403).json({ error: 'System statistics are not available for the current authorization model.' });
});

module.exports = router;
