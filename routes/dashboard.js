const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const orgId = req.user.org_id;
  const userId = req.user.id;

  try {
    const [
      { data: myItems },
      { data: openNCRs },
      { data: openCAPAs },
      { data: recentInspections },
      { data: overdueGauges },
      { count: totalInspections },
      { count: passedInspections }
    ] = await Promise.all([
      // My open items (inspections + NCRs + CAPAs assigned to me)
      supabase.from('vw_my_open_items').select('*').eq('user_id', userId).limit(20),
      // Open NCRs for org
      supabase.from('ncrs').select('id,ncr_number,title,severity,created_at, parts(part_number)')
        .eq('org_id', orgId).eq('status','open').order('created_at',{ascending:false}).limit(5),
      // Open CAPAs for org
      supabase.from('capas').select('id,capa_number,title,due_date,status, users!owner_id(name)')
        .eq('org_id', orgId).in('status',['open','in_progress']).order('due_date',{ascending:true}).limit(5),
      // Recent inspections
      supabase.from('inspection_orders')
        .select('id,order_number,inspection_type,status,result,created_at, parts(part_number,description)')
        .eq('org_id', orgId).order('created_at',{ascending:false}).limit(8),
      // Gauges overdue for calibration
      supabase.from('gauges').select('id,name,serial_number,calibration_due')
        .eq('org_id', orgId).eq('status','overdue').limit(5),
      // Total inspections count
      supabase.from('inspection_orders').select('*',{count:'exact',head:true}).eq('org_id', orgId),
      // Passed inspections count
      supabase.from('inspection_orders').select('*',{count:'exact',head:true}).eq('org_id', orgId).eq('result','pass'),
    ]);

    const passRate = totalInspections ? Math.round((passedInspections / totalInspections) * 100) : null;

    res.json({
      my_items: myItems || [],
      open_ncrs: openNCRs || [],
      open_capas: openCAPAs || [],
      recent_inspections: recentInspections || [],
      overdue_gauges: overdueGauges || [],
      stats: {
        total_inspections: totalInspections || 0,
        pass_rate_pct: passRate,
        open_ncr_count: openNCRs?.length || 0,
        open_capa_count: openCAPAs?.length || 0,
        overdue_gauges_count: overdueGauges?.length || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
