const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth } = require('./auth');

const router = express.Router();

// Control chart constants
const D2 = 1.128; // for n=2 (moving range)
const D4_MR = 3.267;
const XBAR_R_CONSTANTS = {
  2:  { A2: 1.880, D3: 0,     D4: 3.267, d2: 1.128 },
  3:  { A2: 1.023, D3: 0,     D4: 2.575, d2: 1.693 },
  4:  { A2: 0.729, D3: 0,     D4: 2.282, d2: 2.059 },
  5:  { A2: 0.577, D3: 0,     D4: 2.115, d2: 2.326 },
  6:  { A2: 0.483, D3: 0,     D4: 2.004, d2: 2.534 },
  7:  { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
  8:  { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
  9:  { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.970 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 },
};

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

// GET /api/analytics/characteristic/:id
// Returns I-MR chart data, histogram, Cp/Cpk for a characteristic
router.get('/characteristic/:id', requireAuth, async (req, res) => {
  try {
    // Verify characteristic belongs to org via control plan
    const char = await db.one(
      `SELECT c.*, cp.org_id
       FROM characteristics c
       JOIN control_plans cp ON cp.id = c.control_plan_id
       WHERE c.id = $1 AND cp.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!char) return res.status(404).json({ error: 'Characteristic not found' });

    const readings = await db.query(
      `SELECT r.*, io.order_number, io.created_at AS order_date
       FROM readings r
       JOIN inspection_orders io ON io.id = r.inspection_order_id
       WHERE r.characteristic_id = $1
       ORDER BY r.created_at ASC`,
      [req.params.id]
    );

    const numericReadings = readings
      .map(r => ({ ...r, val: parseFloat(r.actual_value) }))
      .filter(r => !isNaN(r.val));

    if (numericReadings.length < 2) {
      return res.json({ characteristic: char, readings: numericReadings, stats: null, histogram: null, controlChart: null });
    }

    const values = numericReadings.map(r => r.val);
    const xbar = mean(values);
    const s = stdDev(values);

    // Moving ranges
    const movingRanges = values.slice(1).map((v, i) => Math.abs(v - values[i]));
    const mrBar = mean(movingRanges);
    const sigmaEst = mrBar / D2;

    // I-MR control limits
    const ucl = xbar + 3 * sigmaEst;
    const lcl = xbar - 3 * sigmaEst;
    const uclMR = D4_MR * mrBar;

    // Cp/Cpk
    const usl = char.usl != null ? parseFloat(char.usl) : null;
    const lsl = char.lsl != null ? parseFloat(char.lsl) : null;
    const nominal = char.nominal != null ? parseFloat(char.nominal) : null;

    let cp = null, cpk = null, cpu = null, cpl = null, pp = null, ppk = null;
    if (usl != null && lsl != null && s > 0) {
      cp = (usl - lsl) / (6 * sigmaEst);
      cpu = (usl - xbar) / (3 * sigmaEst);
      cpl = (xbar - lsl) / (3 * sigmaEst);
      cpk = Math.min(cpu, cpl);
      pp = (usl - lsl) / (6 * s);
      ppk = Math.min((usl - xbar) / (3 * s), (xbar - lsl) / (3 * s));
    } else if (usl != null && s > 0) {
      cpu = (usl - xbar) / (3 * sigmaEst);
      cpk = cpu;
    } else if (lsl != null && s > 0) {
      cpl = (xbar - lsl) / (3 * sigmaEst);
      cpk = cpl;
    }

    // Histogram bins
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(values.length))));
    const binWidth = (max - min) / binCount || 1;
    const bins = Array.from({ length: binCount }, (_, i) => {
      const lo = min + i * binWidth;
      const hi = lo + binWidth;
      const count = values.filter(v => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length;
      return { lo: parseFloat(lo.toFixed(4)), hi: parseFloat(hi.toFixed(4)), mid: parseFloat((lo + binWidth / 2).toFixed(4)), count };
    });

    // Out-of-spec count
    const outOfSpec = values.filter(v =>
      (usl != null && v > usl) || (lsl != null && v < lsl)
    ).length;

    res.json({
      characteristic: char,
      stats: {
        n: values.length,
        mean: parseFloat(xbar.toFixed(6)),
        std_dev: parseFloat(s.toFixed(6)),
        sigma_est: parseFloat(sigmaEst.toFixed(6)),
        min: parseFloat(min.toFixed(6)),
        max: parseFloat(max.toFixed(6)),
        range: parseFloat((max - min).toFixed(6)),
        cp: cp != null ? parseFloat(cp.toFixed(3)) : null,
        cpk: cpk != null ? parseFloat(cpk.toFixed(3)) : null,
        cpu: cpu != null ? parseFloat(cpu.toFixed(3)) : null,
        cpl: cpl != null ? parseFloat(cpl.toFixed(3)) : null,
        pp: pp != null ? parseFloat(pp.toFixed(3)) : null,
        ppk: ppk != null ? parseFloat(ppk.toFixed(3)) : null,
        out_of_spec: outOfSpec,
        out_of_spec_pct: parseFloat((outOfSpec / values.length * 100).toFixed(1)),
        usl, lsl, nominal,
        capability_class: cpk == null ? null : cpk >= 1.67 ? 'excellent' : cpk >= 1.33 ? 'capable' : cpk >= 1.0 ? 'marginal' : 'not_capable',
      },
      controlChart: {
        xbar: parseFloat(xbar.toFixed(6)),
        ucl: parseFloat(ucl.toFixed(6)),
        lcl: parseFloat(lcl.toFixed(6)),
        mr_bar: parseFloat(mrBar.toFixed(6)),
        ucl_mr: parseFloat(uclMR.toFixed(6)),
        points: numericReadings.map((r, i) => ({
          idx: i + 1,
          val: parseFloat(r.val.toFixed(6)),
          mr: i > 0 ? parseFloat(movingRanges[i - 1].toFixed(6)) : null,
          in_spec: r.in_spec,
          order_number: r.order_number,
          date: r.created_at,
          out_of_control: r.val > ucl || r.val < lcl,
        })),
      },
      histogram: { bins, binWidth: parseFloat(binWidth.toFixed(4)) },
    });
  } catch (err) {
    console.error('Analytics characteristic error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/xbar-r/:controlPlanId
// Xbar-R chart for subgroup data (grouped by sample_number in inspection orders)
router.get('/xbar-r/:characteristicId', requireAuth, async (req, res) => {
  try {
    const char = await db.one(
      `SELECT c.*, cp.org_id FROM characteristics c
       JOIN control_plans cp ON cp.id = c.control_plan_id
       WHERE c.id = $1 AND cp.org_id = $2`,
      [req.params.characteristicId, req.user.orgId]
    );
    if (!char) return res.status(404).json({ error: 'Not found' });

    // Get readings grouped by inspection_order + sample_number as subgroups
    const readings = await db.query(
      `SELECT r.inspection_order_id, r.sample_number, r.actual_value, io.order_number
       FROM readings r
       JOIN inspection_orders io ON io.id = r.inspection_order_id
       WHERE r.characteristic_id = $1
       ORDER BY io.created_at, r.sample_number`,
      [req.params.characteristicId]
    );

    // Group by inspection_order_id (each order = one subgroup)
    const groups = {};
    for (const r of readings) {
      const key = r.inspection_order_id;
      if (!groups[key]) groups[key] = { order_number: r.order_number, values: [] };
      const v = parseFloat(r.actual_value);
      if (!isNaN(v)) groups[key].values.push(v);
    }

    const subgroups = Object.values(groups).filter(g => g.values.length >= 2);
    if (subgroups.length < 2) {
      return res.json({ characteristic: char, subgroups: [], stats: null });
    }

    const n = Math.round(mean(subgroups.map(g => g.values.length)));
    const constants = XBAR_R_CONSTANTS[Math.min(10, Math.max(2, n))] || XBAR_R_CONSTANTS[5];

    const subgroupStats = subgroups.map(g => ({
      order_number: g.order_number,
      xbar: parseFloat(mean(g.values).toFixed(6)),
      r: parseFloat((Math.max(...g.values) - Math.min(...g.values)).toFixed(6)),
      n: g.values.length,
    }));

    const xDoublebar = mean(subgroupStats.map(s => s.xbar));
    const rBar = mean(subgroupStats.map(s => s.r));

    res.json({
      characteristic: char,
      subgroups: subgroupStats.map((s, i) => ({
        ...s,
        idx: i + 1,
        out_of_control_x: s.xbar > xDoublebar + constants.A2 * rBar || s.xbar < xDoublebar - constants.A2 * rBar,
        out_of_control_r: s.r > constants.D4 * rBar,
      })),
      stats: {
        x_double_bar: parseFloat(xDoublebar.toFixed(6)),
        r_bar: parseFloat(rBar.toFixed(6)),
        ucl_xbar: parseFloat((xDoublebar + constants.A2 * rBar).toFixed(6)),
        lcl_xbar: parseFloat((xDoublebar - constants.A2 * rBar).toFixed(6)),
        ucl_r: parseFloat((constants.D4 * rBar).toFixed(6)),
        lcl_r: parseFloat((constants.D3 * rBar).toFixed(6)),
        sigma_est: parseFloat((rBar / constants.d2).toFixed(6)),
        n_avg: n,
        constants,
      },
    });
  } catch (err) {
    console.error('Xbar-R error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/pareto
// Pareto chart of NCR defects by category/title
router.get('/pareto', requireAuth, async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const ncrs = await db.query(
      `SELECT title, severity, COUNT(*)::int AS count
       FROM ncrs
       WHERE org_id = $1 AND created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY title, severity
       ORDER BY count DESC
       LIMIT 50`,
      [req.user.orgId]
    );

    // Also get by part
    const byPart = await db.query(
      `SELECT p.part_number, COUNT(n.id)::int AS count
       FROM ncrs n
       JOIN parts p ON p.id = n.part_id
       WHERE n.org_id = $1 AND n.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY p.part_number
       ORDER BY count DESC
       LIMIT 20`,
      [req.user.orgId]
    );

    // Also get by supplier
    const bySupplier = await db.query(
      `SELECT s.name AS supplier_name, COUNT(n.id)::int AS count
       FROM ncrs n
       JOIN suppliers s ON s.id = n.supplier_id
       WHERE n.org_id = $1 AND n.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY s.name
       ORDER BY count DESC
       LIMIT 20`,
      [req.user.orgId]
    );

    const total = ncrs.reduce((s, r) => s + r.count, 0);
    let cumulative = 0;
    const paretoData = ncrs.map(r => {
      cumulative += r.count;
      return { ...r, cumulative_pct: parseFloat((cumulative / total * 100).toFixed(1)) };
    });

    res.json({ by_defect: paretoData, by_part: byPart, by_supplier: bySupplier, total, days: parseInt(days) });
  } catch (err) {
    console.error('Pareto error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/scatter?x=charId&y=charId
router.get('/scatter', requireAuth, async (req, res) => {
  try {
    const { x, y } = req.query;
    if (!x || !y) return res.status(400).json({ error: 'x and y characteristic IDs required' });

    // Verify both chars belong to org
    const charX = await db.one(`SELECT c.*, cp.org_id FROM characteristics c JOIN control_plans cp ON cp.id = c.control_plan_id WHERE c.id = $1 AND cp.org_id = $2`, [x, req.user.orgId]);
    const charY = await db.one(`SELECT c.*, cp.org_id FROM characteristics c JOIN control_plans cp ON cp.id = c.control_plan_id WHERE c.id = $1 AND cp.org_id = $2`, [y, req.user.orgId]);
    if (!charX || !charY) return res.status(404).json({ error: 'Characteristic not found' });

    // Paired readings from same inspection order + sample
    const pairs = await db.query(
      `SELECT rx.actual_value AS x_val, ry.actual_value AS y_val,
              io.order_number, rx.sample_number
       FROM readings rx
       JOIN readings ry ON ry.inspection_order_id = rx.inspection_order_id
         AND ry.sample_number = rx.sample_number
         AND ry.characteristic_id = $2
       JOIN inspection_orders io ON io.id = rx.inspection_order_id
       WHERE rx.characteristic_id = $1 AND io.org_id = $3
       ORDER BY rx.created_at`,
      [x, y, req.user.orgId]
    );

    const numPairs = pairs
      .map(p => ({ x: parseFloat(p.x_val), y: parseFloat(p.y_val), order: p.order_number, sample: p.sample_number }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));

    // Pearson correlation
    let r = null;
    if (numPairs.length >= 3) {
      const xs = numPairs.map(p => p.x);
      const ys = numPairs.map(p => p.y);
      const mx = mean(xs), my = mean(ys);
      const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
      const den = Math.sqrt(xs.reduce((s, x) => s + Math.pow(x - mx, 2), 0) * ys.reduce((s, y) => s + Math.pow(y - my, 2), 0));
      r = den > 0 ? parseFloat((num / den).toFixed(4)) : null;
    }

    res.json({ char_x: charX, char_y: charY, pairs: numPairs, correlation: r, n: numPairs.length });
  } catch (err) {
    console.error('Scatter error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/analytics/gauge-rr/:studyId — retrieve gauge R&R study results
// POST /api/analytics/gauge-rr — compute results from study data
router.post('/gauge-rr', requireAuth, async (req, res) => {
  try {
    const { measurements, part_count, operator_count, replicates } = req.body;
    // measurements: array of { operator, part, replicate, value }
    if (!measurements?.length) return res.status(400).json({ error: 'measurements required' });

    const operators = [...new Set(measurements.map(m => m.operator))].sort();
    const parts = [...new Set(measurements.map(m => m.part))].sort();
    const p = parts.length;
    const o = operators.length;
    const r = replicates || Math.round(measurements.length / (p * o));

    if (p < 2 || o < 2) return res.status(400).json({ error: 'Need at least 2 operators and 2 parts' });

    // Average & Range Method
    const getVals = (op, pt) => measurements.filter(m => m.operator === op && m.part === pt).map(m => parseFloat(m.value)).filter(v => !isNaN(v));

    // Ranges per operator per part
    const ranges = [];
    const opMeans = {};
    for (const op of operators) {
      opMeans[op] = [];
      for (const pt of parts) {
        const vals = getVals(op, pt);
        if (vals.length > 0) {
          ranges.push(Math.max(...vals) - Math.min(...vals));
          opMeans[op].push(mean(vals));
        }
      }
    }

    const rBar = mean(ranges);
    const d2 = (XBAR_R_CONSTANTS[r] || XBAR_R_CONSTANTS[2]).d2;
    const sigmaRepeat = rBar / d2;

    // Reproducibility (between operators)
    const opGrandMeans = operators.map(op => mean(opMeans[op]));
    const xDiffMax = Math.max(...opGrandMeans) - Math.min(...opGrandMeans);
    const d2_o = (XBAR_R_CONSTANTS[o] || XBAR_R_CONSTANTS[2]).d2;
    const sigmaReprod_raw = xDiffMax / d2_o;
    const sigmaReprod = Math.sqrt(Math.max(0, Math.pow(sigmaReprod_raw, 2) - Math.pow(sigmaRepeat, 2) / (p * r)));

    // Part variation
    const partMeans = parts.map(pt => {
      const vals = operators.flatMap(op => getVals(op, pt));
      return mean(vals);
    });
    const partRange = Math.max(...partMeans) - Math.min(...partMeans);
    const d2_p = (XBAR_R_CONSTANTS[p] || XBAR_R_CONSTANTS[2]).d2;
    const sigmaPart = partRange / d2_p;

    const sigmaGRR = Math.sqrt(Math.pow(sigmaRepeat, 2) + Math.pow(sigmaReprod, 2));
    const sigmaTotal = Math.sqrt(Math.pow(sigmaGRR, 2) + Math.pow(sigmaPart, 2));

    const pctGRR = sigmaTotal > 0 ? (sigmaGRR / sigmaTotal * 100) : 0;
    const pctRepeat = sigmaTotal > 0 ? (sigmaRepeat / sigmaTotal * 100) : 0;
    const pctReprod = sigmaTotal > 0 ? (sigmaReprod / sigmaTotal * 100) : 0;
    const pctPart = sigmaTotal > 0 ? (sigmaPart / sigmaTotal * 100) : 0;

    res.json({
      results: {
        sigma_repeatability: parseFloat(sigmaRepeat.toFixed(6)),
        sigma_reproducibility: parseFloat(sigmaReprod.toFixed(6)),
        sigma_grr: parseFloat(sigmaGRR.toFixed(6)),
        sigma_part: parseFloat(sigmaPart.toFixed(6)),
        sigma_total: parseFloat(sigmaTotal.toFixed(6)),
        pct_grr: parseFloat(pctGRR.toFixed(1)),
        pct_repeatability: parseFloat(pctRepeat.toFixed(1)),
        pct_reproducibility: parseFloat(pctReprod.toFixed(1)),
        pct_part_variation: parseFloat(pctPart.toFixed(1)),
        ndc: parseFloat((1.41 * sigmaPart / sigmaGRR).toFixed(1)),
        verdict: pctGRR < 10 ? 'Acceptable' : pctGRR < 30 ? 'Marginal — conditionally acceptable' : 'Unacceptable — measurement system needs improvement',
      },
      operator_means: operators.map((op, i) => ({ operator: op, mean: parseFloat(opGrandMeans[i].toFixed(6)) })),
      part_means: parts.map((pt, i) => ({ part: pt, mean: parseFloat(partMeans[i].toFixed(6)) })),
      r_bar: parseFloat(rBar.toFixed(6)),
      ucl_r: parseFloat((XBAR_R_CONSTANTS[r]?.D4 || 3.267) * rBar.toFixed(6)),
    });
  } catch (err) {
    console.error('Gauge R&R error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
