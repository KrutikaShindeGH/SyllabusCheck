import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface Course {
  id: string;
  title: string;
  code: string;
  domain: string;
  status: string;
  coverage_score: number | null;
}

interface PerCourse {
  course_id: string;
  course_name: string;
  domain: string;
  covered_count: number;
  total_required: number;
  coverage_pct: number;
  covered_keywords: string[];
}

interface GapResult {
  job_role: string;
  jobs_matched: number;
  total_required_keywords: number;
  total_covered: number;
  overall_coverage_pct: number;
  covered_keywords: string[];
  missing_keywords: string[];
  per_course_breakdown: PerCourse[];
  warning?: string;
}

// ─── Colour helpers ────────────────────────────────────────────────────────────
const pctColor  = (p: number) => p >= 70 ? '#10b981' : p >= 40 ? '#f59e0b' : '#ef4444';
const pctClass  = (p: number) => p >= 70 ? 'text-emerald-600' : p >= 40 ? 'text-amber-500' : 'text-red-500';

// ─── 1. Donut (covered / missing / total) ─────────────────────────────────────
function DonutChart({ covered, missing, total, size = 130 }:
  { covered: number; missing: number; total: number; size?: number }) {
  const pct  = total ? Math.round(covered / total * 100) : 0;
  const r    = (size - 18) / 2;
  const circ = 2 * Math.PI * r;
  const covArc  = total ? (covered / total) * circ : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#fee2e2" strokeWidth={13} />
      {covArc > 0 && (
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={pctColor(pct)} strokeWidth={13}
          strokeDasharray={`${covArc} ${circ}`} strokeLinecap="butt"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      )}
      <text x={size/2} y={size/2 - 7} textAnchor="middle" dominantBaseline="middle"
        fontSize={19} fontWeight="700" fill={pctColor(pct)}>{pct}%</text>
      <text x={size/2} y={size/2 + 12} textAnchor="middle" dominantBaseline="middle"
        fontSize={9} fill="#9ca3af">program coverage</text>
    </svg>
  );
}

// ─── 2. Coverage funnel ────────────────────────────────────────────────────────
function CoverageFunnel({ result }: { result: GapResult }) {
  const { total_required_keywords: total, total_covered: covered, missing_keywords } = result;
  const missing = missing_keywords.length;
  const pct = total ? Math.round(covered / total * 100) : 0;
  const stages = [
    { label: 'Required by Job Role', count: total,   pct: 100,  bg: '#e0e7ff', fg: '#3730a3' },
    { label: 'Covered by Program',   count: covered,  pct,       bg: '#d1fae5', fg: '#065f46' },
    { label: 'Gap (Missing)',         count: missing,  pct: total ? Math.round(missing/total*100) : 0, bg: '#fee2e2', fg: '#991b1b' },
  ];
  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-right text-xs text-gray-600 font-medium shrink-0" style={{ width: 150 }}>
            {s.label}
          </span>
          <div className="flex-1 rounded-lg bg-gray-100 overflow-hidden" style={{ height: 28 }}>
            <div className="h-full rounded-lg flex items-center px-3 transition-all duration-700"
              style={{ width: `${Math.max(s.pct, 3)}%`, background: s.bg }}>
              <span className="text-xs font-bold" style={{ color: s.fg }}>{s.count}</span>
            </div>
          </div>
          <span className="text-xs font-semibold shrink-0 w-8 text-right" style={{ color: s.fg }}>
            {s.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 3. Per-course stacked bar ─────────────────────────────────────────────────
function StackedBar({ covered, total }: { covered: number; total: number }) {
  const pct = total ? covered / total * 100 : 0;
  return (
    <div className="flex-1 h-2.5 bg-red-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: pctColor(pct) }} />
    </div>
  );
}

// ─── 4. Polar contribution chart ──────────────────────────────────────────────
function PolarChart({ breakdown }: { breakdown: PerCourse[] }) {
  if (breakdown.length < 2) return null;
  const n = breakdown.length;
  const cx = 130, cy = 130, outerR = 105, innerR = 18;
  const step = (2 * Math.PI) / n;
  return (
    <svg viewBox="0 0 260 260" width="100%" style={{ maxWidth: 240 }}>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <circle key={f} cx={cx} cy={cy} r={innerR + (outerR - innerR) * f}
          fill="none" stroke="#f3f4f6" strokeWidth={1} />
      ))}
      {[25, 50, 75, 100].map(v => (
        <text key={v} x={cx + 4} y={cy - (innerR + (outerR - innerR) * v / 100) + 4}
          fontSize={7} fill="#d1d5db">{v}</text>
      ))}
      {breakdown.map((c, i) => {
        const angle = i * step - Math.PI / 2;
        const barR  = innerR + (outerR - innerR) * (c.coverage_pct / 100);
        const bx = cx + Math.cos(angle) * barR;
        const by = cy + Math.sin(angle) * barR;
        const ox = cx + Math.cos(angle) * outerR;
        const oy = cy + Math.sin(angle) * outerR;
        const lx = cx + Math.cos(angle) * (outerR + 16);
        const ly = cy + Math.sin(angle) * (outerR + 16);
        const col = pctColor(c.coverage_pct);
        return (
          <g key={c.course_id}>
            <line x1={cx} y1={cy} x2={ox} y2={oy} stroke="#e5e7eb" strokeWidth={1} />
            <line x1={cx} y1={cy} x2={bx} y2={by}
              stroke={col} strokeWidth={5} strokeLinecap="round" opacity={0.8} />
            <circle cx={bx} cy={by} r={4.5} fill={col} />
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize={7.5} fill="#6b7280" fontWeight="500">
              {c.course_name.length > 13 ? c.course_name.slice(0, 12) + '…' : c.course_name}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={innerR} fill="#f9fafb" stroke="#e5e7eb" />
    </svg>
  );
}

// ─── 5. Skill × Syllabus heatmap ──────────────────────────────────────────────
function SkillHeatmap({ breakdown, allMissing, allCovered }:
  { breakdown: PerCourse[]; allMissing: string[]; allCovered: string[] }) {
  if (!breakdown.length) return null;
  const coveredByCourse: Record<string, Set<string>> = {};
  breakdown.forEach(c => {
    coveredByCourse[c.course_id] = new Set(c.covered_keywords.map(k => k.toLowerCase()));
  });

  const topMissing = allMissing.slice(0, 24);
  const topCovered = allCovered.slice(0, 8);
  const skills = [...topMissing, ...topCovered];

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="text-left pr-3 pb-1 text-gray-400 font-medium min-w-[120px]">Skill</th>
            {breakdown.map(c => (
              <th key={c.course_id} className="px-1 pb-1 font-medium text-gray-500"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 72 }}>
                <span className="block truncate max-w-[68px]">{c.course_name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skills.map((skill, si) => {
            const isMissing = topMissing.includes(skill);
            const isSection = si === topMissing.length;
            return (
              <>
                {isSection && (
                  <tr key="divider">
                    <td colSpan={breakdown.length + 1}>
                      <div className="my-1.5 border-t border-dashed border-gray-200" />
                    </td>
                  </tr>
                )}
                <tr key={skill} className={si % 2 === 0 ? 'bg-gray-50/60' : ''}>
                  <td className="py-0.5 pr-3">
                    <span className={`font-medium truncate block max-w-[120px] ${isMissing ? 'text-red-600' : 'text-emerald-700'}`}>
                      {isMissing ? '✕' : '✓'} {skill}
                    </span>
                  </td>
                  {breakdown.map(c => {
                    const has = coveredByCourse[c.course_id]?.has(skill.toLowerCase());
                    return (
                      <td key={c.course_id} className="text-center px-1 py-0.5">
                        <span className="inline-block w-5 h-5 rounded"
                          style={{ background: has ? '#bbf7d0' : isMissing ? '#fee2e2' : '#f3f4f6' }}
                          title={`${c.course_name}: ${has ? 'covers' : 'missing'} "${skill}"`} />
                      </td>
                    );
                  })}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#bbf7d0] inline-block" />Covered</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#fee2e2] inline-block" />Missing (required)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" />Not required here</span>
      </div>
    </div>
  );
}

// ─── 6. Keyword pill cloud (flex-wrap, same style as All Keywords tab) ────────
function KeywordPills({ keywords, covered }: { keywords: string[]; covered: boolean }) {
  const shown = keywords.slice(0, 40);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((k, i) => (
        covered ? (
          <span key={k} className="text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium">
            {k}
          </span>
        ) : (
          <span key={k} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium">
            <span className="text-red-300 text-[9px]">#{i+1}</span>{k}
          </span>
        )
      ))}
    </div>
  );
}

// ─── Academic PDF Generator ───────────────────────────────────────────────────
function generateAcademicPDF(result: GapResult, selectedCourses: Course[]) {
  const date     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const semester = (() => {
    const m = new Date().getMonth();
    const y = new Date().getFullYear();
    if (m <= 4) return `Spring ${y}`;
    if (m <= 7) return `Summer ${y}`;
    return `Fall ${y}`;
  })();
  const pct  = result.total_required_keywords
    ? Math.round(result.total_covered / result.total_required_keywords * 100) : 0;
  const gapPct = result.total_required_keywords
    ? Math.round(result.missing_keywords.length / result.total_required_keywords * 100) : 0;

  // Determine coverage rating label
  const rating = pct >= 75 ? 'Strong' : pct >= 50 ? 'Moderate' : pct >= 25 ? 'Developing' : 'Critical Gap';
  const ratingColor = pct >= 75 ? '#065f46' : pct >= 50 ? '#92400e' : pct >= 25 ? '#1e40af' : '#7f1d1d';

  const courseRows = result.per_course_breakdown.map((c, i) => {
    const barWidth = Math.round(c.coverage_pct);
    const barColor = c.coverage_pct >= 70 ? '#059669' : c.coverage_pct >= 40 ? '#d97706' : '#dc2626';
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-family:'Times New Roman',serif;">${i+1}. ${c.course_name}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:9pt;color:#6b7280;">${c.domain || '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#059669;font-weight:700;">${c.covered_count}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.total_required}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;background:#e5e7eb;border-radius:3px;height:5px;">
            <div style="width:${barWidth}%;background:${barColor};height:5px;border-radius:3px;"></div>
          </div>
          <span style="font-weight:700;color:${barColor};font-size:9pt;white-space:nowrap;">${c.coverage_pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const kwList = (kws: string[]) =>
    kws.join(', ');

  const topMissingRows = result.missing_keywords.slice(0, 15).map((k, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#fef2f2'};">
      <td style="padding:5px 10px;border-bottom:1px solid #fecaca;font-weight:600;color:#7f1d1d;width:24px;">${i+1}.</td>
      <td style="padding:5px 10px;border-bottom:1px solid #fecaca;font-family:'Times New Roman',serif;">${k}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #fecaca;font-size:8.5pt;color:#6b7280;font-style:italic;">Not covered in any selected syllabus</td>
    </tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>UTD Curriculum Gap Report — ${result.job_role} — ${date}</title>
<style>
  /* ── A4 page setup ── */
  @page {
    size: A4 portrait;
    margin: 18mm 20mm 18mm 20mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #111;
    background: #fff;
  }
  /* Screen: show as A4 sheet centred */
  .page {
    width: 170mm;           /* 210mm - 40mm total margin */
    margin: 12mm auto;
    padding: 0;
    background: #fff;
  }
  @media print {
    html, body { width: 210mm; margin: 0; }
    .page { width: 100%; margin: 0; padding: 0; }
    a { text-decoration: none; color: inherit; }
  }

  /* ── UTD Header ── */
  .utd-header {
    text-align: center;
    padding-bottom: 14px;
    margin-bottom: 16px;
    border-bottom: 2.5px solid #154360;
  }
  .utd-seal-line {
    font-size: 7.5pt;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #154360;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .utd-university { display: none; }
  .utd-school {
    font-size: 8.5pt;
    color: #2c6e9e;
    font-style: italic;
    margin-bottom: 10px;
  }
  .report-type-badge {
    display: inline-block;
    background: #154360;
    color: #fff;
    font-size: 7pt;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    padding: 2px 10px;
    margin-bottom: 8px;
  }
  .report-title {
    font-size: 15pt;
    font-weight: 700;
    color: #111;
    line-height: 1.2;
    margin-bottom: 4px;
  }
  .report-subtitle {
    font-size: 10pt;
    color: #374151;
    font-style: italic;
    margin-bottom: 10px;
  }
  .report-meta-grid {
    display: table;
    width: 100%;
    border: 1px solid #d1d5db;
    margin-top: 10px;
    font-size: 8pt;
  }
  .report-meta-grid-row { display: table-row; }
  .meta-cell {
    display: table-cell;
    width: 33.33%;
    padding: 5px 10px;
    border-right: 1px solid #d1d5db;
    color: #374151;
    vertical-align: top;
  }
  .meta-cell:last-child { border-right: none; }
  .meta-cell .meta-label { font-weight: 700; text-transform: uppercase; font-size: 6.5pt; letter-spacing: 1px; color: #6b7280; display: block; margin-bottom: 1px; }
  .meta-cell .meta-value { font-size: 8.5pt; color: #111; font-weight: 600; }

  /* ── Section headings ── */
  h2 {
    font-size: 10pt;
    font-weight: 700;
    color: #154360;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1.5px solid #154360;
    padding-bottom: 4px;
    margin: 18px 0 9px;
  }
  h3 {
    font-size: 9.5pt;
    font-weight: 700;
    color: #1f2937;
    margin: 12px 0 5px;
    font-style: italic;
  }

  /* ── Executive Summary box ── */
  .exec-summary {
    border: 1.5px solid #154360;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .exec-summary-header {
    background: #154360;
    color: #fff;
    padding: 4px 12px;
    font-size: 7.5pt;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .exec-summary-body {
    display: table;
    width: 100%;
  }
  .exec-stat {
    display: table-cell;
    width: 25%;
    padding: 10px 8px;
    text-align: center;
    border-right: 1px solid #e5e7eb;
    vertical-align: middle;
  }
  .exec-stat:last-child { border-right: none; }
  .exec-stat .stat-value { font-size: 20pt; font-weight: 700; line-height: 1; display: block; }
  .exec-stat .stat-label { font-size: 6.5pt; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; display: block; }
  .rating-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 2px;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 3px;
  }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }
  .tbl-header thead tr { background: #154360; color: #fff; }
  .tbl-header thead th { padding: 6px 8px; text-align: left; font-size: 8pt; letter-spacing: 0.5px; font-weight: 600; }
  .tbl-header thead th:not(:first-child) { text-align: center; }
  tfoot td { background: #f1f5f9; font-size: 7.5pt; color: #374151; padding: 4px 8px; font-style: italic; border-top: 1.5px solid #154360; }

  /* ── Info box ── */
  .info-box {
    border-left: 3px solid #154360;
    background: #f0f7ff;
    padding: 8px 12px;
    font-size: 8.5pt;
    color: #1e3a5f;
    margin-bottom: 12px;
    line-height: 1.5;
  }
  .info-box strong { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; color: #154360; }

  /* ── Interp box ── */
  .interp-box {
    border: 1px solid #d1d5db;
    background: #f9fafb;
    padding: 8px 12px;
    font-size: 8.5pt;
    color: #374151;
    margin-bottom: 12px;
    line-height: 1.5;
  }

  /* ── Priority table ── */
  .priority-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }
  .priority-table thead tr { background: #7f1d1d; color: #fff; }
  .priority-table thead th { padding: 6px 8px; font-size: 8pt; letter-spacing: 0.5px; text-align: left; }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 2px solid #154360;
    font-size: 7.5pt;
    color: #6b7280;
    display: table;
    width: 100%;
    font-style: italic;
  }
  .footer-left  { display: table-cell; text-align: left; }
  .footer-mid   { display: table-cell; text-align: center; }
  .footer-right { display: table-cell; text-align: right; }

  /* ── Page breaks ── */
  .page-break { page-break-before: always; }
  .no-break   { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="page">

  <!-- ══ UTD HEADER ══ -->
  <div class="utd-header">
    <div class="utd-seal-line">The University of Texas at Dallas</div>
    <div class="utd-school">Office of Academic Programs &nbsp;&middot;&nbsp; Curriculum Analytics Initiative &nbsp;&middot;&nbsp; SyllabusCheck</div>
    <div class="report-type-badge">Curriculum Gap Analysis Report</div>
    <div class="report-title">Program Alignment with Industry Job Market</div>
    <div class="report-subtitle">Target Role: <em>${result.job_role}</em> &nbsp;|&nbsp; ${semester}</div>
    <div class="report-meta-grid">
      <div class="report-meta-grid-row">
        <div class="meta-cell">
          <span class="meta-label">Report Generated</span>
          <span class="meta-value">${date}</span>
        </div>
        <div class="meta-cell">
          <span class="meta-label">Job Postings Analyzed</span>
          <span class="meta-value">${result.jobs_matched} postings for &ldquo;${result.job_role}&rdquo;</span>
        </div>
        <div class="meta-cell">
          <span class="meta-label">Syllabi Included</span>
          <span class="meta-value">${selectedCourses.length} UTD course syllab${selectedCourses.length === 1 ? 'us' : 'i'}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ INTERPRETATION NOTE ══ -->
  <div class="interp-box">
    <strong style="font-size:9pt;text-transform:uppercase;letter-spacing:1px;color:#374151;display:block;margin-bottom:4px;">How to Read This Report</strong>
    This report analyzed <strong>${result.jobs_matched} active job postings</strong> for the role of
    <strong>${result.job_role}</strong> and extracted <strong>${result.total_required_keywords} unique skills</strong>
    that employers require for this position. These skills were then matched against the topics covered
    across the <strong>${selectedCourses.length} selected UTD syllab${selectedCourses.length === 1 ? 'us' : 'i'}</strong>.
    A skill is marked <em>covered</em> if it appears in at least one syllabus; <em>missing</em> if no syllabus addresses it.
  </div>

  <!-- ══ EXECUTIVE SUMMARY ══ -->
  <h2>I. Executive Summary</h2>
  <div class="exec-summary no-break">
    <div class="exec-summary-header">Program Coverage at a Glance</div>
    <div class="exec-summary-body">
      <div class="exec-stat">
        <span class="stat-value" style="color:${pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'};">${pct}%</span>
        <span class="stat-label">Overall Coverage</span>
        <span class="rating-badge" style="background:${ratingColor};color:#fff;">${rating}</span>
      </div><div class="exec-stat">
        <span class="stat-value" style="color:#154360;">${result.total_required_keywords}</span>
        <span class="stat-label">Unique Skills in Job Postings</span>
      </div><div class="exec-stat">
        <span class="stat-value" style="color:#059669;">${result.total_covered}</span>
        <span class="stat-label">Skills Covered by Program</span>
      </div><div class="exec-stat">
        <span class="stat-value" style="color:#dc2626;">${result.missing_keywords.length}</span>
        <span class="stat-label">Skills Not in Any Syllabus</span>
      </div>
    </div>
  </div>

  <p style="font-size:10.5pt;color:#111;margin-bottom:16px;line-height:1.8;text-align:justify;">
    The selected UTD curriculum collectively addresses <strong>${result.total_covered}</strong> of the
    <strong>${result.total_required_keywords}</strong> skills identified as requirements across
    <strong>${result.jobs_matched}</strong> active job postings for <strong>${result.job_role}</strong> roles,
    yielding an overall program coverage rate of <strong>${pct}%</strong> (Rating: <em>${rating}</em>).
    The remaining <strong>${result.missing_keywords.length} skills</strong> (${gapPct}%) represent curriculum
    gaps relative to current market demands and are detailed in Section IV of this report.
  </p>

  <div class="info-box">
    <strong>Methodology</strong>
    Skills were extracted from job postings via NLP keyword analysis (Claude Haiku model).
    Coverage was determined through semantic similarity matching between syllabus topics and
    job-required keywords (threshold &ge; 0.75 cosine similarity for &ldquo;covered&rdquo;,
    &ge; 0.50 for &ldquo;partial&rdquo;). All ${result.total_required_keywords} skills represent
    unique keywords extracted across ${result.jobs_matched} postings — a skill appearing in
    multiple postings is counted once but weighted by frequency in gap prioritization.
  </div>

  <!-- ══ SKILL COVERAGE FUNNEL ══ -->
  <h2>II. Skill Coverage Funnel</h2>
  <table style="width:100%;border-collapse:collapse;font-size:10.5pt;margin-bottom:6px;" class="no-break">
    <thead>
      <tr style="background:#154360;color:#fff;">
        <th style="padding:11px 16px;text-align:left;font-size:10pt;letter-spacing:0.8px;width:65%;">Stage</th>
        <th style="padding:11px 16px;text-align:center;font-size:10pt;width:17.5%;">Count</th>
        <th style="padding:11px 16px;text-align:center;font-size:10pt;width:17.5%;">Share</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#ffffff;border-left:4px solid #154360;">
        <td style="padding:12px 16px;border-bottom:1px solid #d1d5db;color:#111;font-weight:600;font-size:10.5pt;">Total skills required by market (${result.jobs_matched} postings)</td>
        <td style="padding:12px 16px;border-bottom:1px solid #d1d5db;text-align:center;font-weight:700;color:#111;font-size:13pt;">${result.total_required_keywords}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #d1d5db;text-align:center;font-weight:600;color:#111;font-size:11pt;">100%</td>
      </tr>
      <tr style="background:#f0fdf4;border-left:4px solid #059669;">
        <td style="padding:12px 16px;border-bottom:1px solid #d1d5db;color:#111;font-weight:600;font-size:10.5pt;">Covered by program (≥1 syllabus addresses the skill)</td>
        <td style="padding:12px 16px;border-bottom:1px solid #d1d5db;text-align:center;font-weight:700;color:#111;font-size:13pt;">${result.total_covered}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #d1d5db;text-align:center;font-weight:600;color:#111;font-size:11pt;">${pct}%</td>
      </tr>
      <tr style="background:#fff5f5;border-left:4px solid #dc2626;">
        <td style="padding:12px 16px;border-bottom:2.5px solid #154360;color:#111;font-weight:600;font-size:10.5pt;">Not covered in any syllabus (curriculum gap)</td>
        <td style="padding:12px 16px;border-bottom:2.5px solid #154360;text-align:center;font-weight:700;color:#111;font-size:13pt;">${result.missing_keywords.length}</td>
        <td style="padding:12px 16px;border-bottom:2.5px solid #154360;text-align:center;font-weight:600;color:#111;font-size:11pt;">${gapPct}%</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size:8.5pt;color:#6b7280;font-style:italic;margin-bottom:20px;">
    Skills extracted from ${result.jobs_matched} job postings for &ldquo;${result.job_role}&rdquo; via automated NLP analysis. Figures reflect unique skills, not cumulative mentions.
  </p>

  <!-- ══ PER-SYLLABUS BREAKDOWN ══ -->
  <h2>III. Per-Syllabus Coverage Breakdown</h2>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;text-align:justify;">
    The table below presents each selected UTD syllabus's individual alignment with the
    <strong>${result.total_required_keywords}</strong> skills required for <strong>${result.job_role}</strong> roles.
    Coverage percentage reflects the share of the total required skill set addressed within that single course.
  </p>
  <table class="tbl-header no-break">
    <thead>
      <tr>
        <th style="width:35%;">Course / Syllabus</th>
        <th style="text-align:center;">Academic Domain</th>
        <th style="text-align:center;">Skills Covered</th>
        <th style="text-align:center;">Total Required</th>
        <th style="text-align:left;width:22%;">Coverage</th>
      </tr>
    </thead>
    <tbody>${courseRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2"><em>Program Total (union of all covered skills)</em></td>
        <td style="text-align:center;font-weight:700;">${result.total_covered}</td>
        <td style="text-align:center;">${result.total_required_keywords}</td>
        <td style="font-weight:700;">${pct}%</td>
      </tr>
    </tfoot>
  </table>
  <p style="font-size:8.5pt;color:#6b7280;font-style:italic;margin-bottom:8px;">
    Note: Individual syllabus percentages will not sum to the program total, as multiple syllabi may cover the same skill.
    The program total reflects the union of all skills covered across syllabi.
  </p>

  <!-- ══ GAP ANALYSIS — PAGE BREAK ══ -->
  <div class="page-break"></div>

  <!-- ══ HIGH-PRIORITY GAPS ══ -->
  <h2>IV. High-Priority Curriculum Gaps</h2>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;text-align:justify;">
    The following <strong>${Math.min(15, result.missing_keywords.length)} skills</strong> represent the
    highest-priority curriculum gaps — they appear most frequently in <strong>${result.job_role}</strong>
    job postings and are entirely absent from the selected UTD syllabi. These should be considered
    as priority additions or enhancements in curriculum development planning.
  </p>
  <table class="priority-table no-break">
    <thead><tr><th style="width:30px;">#</th><th>Skill / Competency</th><th>Status</th></tr></thead>
    <tbody>${topMissingRows}</tbody>
  </table>

  <!-- ══ ALL MISSING SKILLS ══ -->
  <h2>V. Complete Missing Skills Inventory (${result.missing_keywords.length} Skills)</h2>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;text-align:justify;">
    The following <strong>${result.missing_keywords.length} skills</strong> were identified across
    <strong>${result.jobs_matched} ${result.job_role} job postings</strong> but are not addressed in
    any of the ${selectedCourses.length} selected UTD syllab${selectedCourses.length === 1 ? 'us' : 'i'}.
    Listed in order of market frequency (most in-demand first).
  </p>
  <p style="font-size:10pt;color:#111;line-height:2.0;text-align:left;">
    ${result.missing_keywords.slice(0, 150).map((k: string, i: number) =>
      `<span style="display:inline-block;margin:1px 0;">${i+1}.&nbsp;${k}</span>${i < result.missing_keywords.length - 1 ? '&ensp;&bull;&ensp;' : ''}`
    ).join('')}
  </p>

  <!-- ══ COVERED SKILLS ══ -->
  <h2>VI. Covered Skills — Program Strengths (${result.covered_keywords.length} Skills)</h2>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;text-align:justify;">
    The following <strong>${result.covered_keywords.length} skills</strong> required for
    <strong>${result.job_role}</strong> roles are already addressed within the selected UTD curriculum.
    These represent existing program strengths for this career pathway.
  </p>
  <p style="font-size:10pt;color:#111;line-height:2.0;text-align:left;">
    ${result.covered_keywords.map((k: string, i: number) =>
      `<span style="display:inline-block;margin:1px 0;">${i+1}.&nbsp;${k}</span>${i < result.covered_keywords.length - 1 ? '&ensp;&bull;&ensp;' : ''}`
    ).join('')}
  </p>

  <!-- ══ ANALYZED SYLLABI — PAGE BREAK ══ -->
  <div class="page-break"></div>

  <!-- ══ COURSE INVENTORY ══ -->
  <h2>VII. Analyzed UTD Syllabi</h2>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;">
    The following ${selectedCourses.length} UTD course syllab${selectedCourses.length === 1 ? 'us' : 'i'} were included in this analysis:
  </p>
  <table class="tbl-header no-break">
    <thead><tr><th style="width:30px;">#</th><th>Course Title</th><th>Academic Domain</th><th style="text-align:center;">Individual Coverage</th></tr></thead>
    <tbody>
      ${selectedCourses.map((c: Course, i: number) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${i+1}.</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${c.title}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-style:italic;color:#374151;font-size:9.5pt;">${c.domain || 'Not classified'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">
          ${c.coverage_score != null ? `<strong>${c.coverage_score.toFixed(1)}%</strong>` : '<span style="color:#9ca3af;">—</span>'}
        </td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- ══ DISCLOSURE ══ -->
  <div class="info-box" style="margin-top:24px;">
    <strong>Data Sources &amp; Disclosure</strong>
    Job posting data was collected via automated web scraping of publicly available job listings.
    Skill extraction was performed using the Claude Haiku language model (Anthropic, Inc.).
    This report is generated by SyllabusCheck, an internal curriculum analytics tool developed at UTD.
    Results are intended to inform curriculum planning discussions and should be interpreted
    alongside faculty expertise and departmental strategic priorities.
    Report ID: SC-${Date.now().toString(36).toUpperCase()}
  </div>

  <!-- ══ FOOTER ══ -->
  <div class="doc-footer">
    <div class="footer-left">The University of Texas at Dallas &mdash; SyllabusCheck</div>
    <div class="footer-mid">${date}</div>
    <div class="footer-right">Confidential &mdash; For Academic Use Only</div>
  </div>

</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.onload = () => {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 600);
    };
  }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ProgramReport() {
  const [allCourses, setAllCourses]   = useState<Course[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll]     = useState(false);
  const [jobRole, setJobRole]         = useState('');
  const [result, setResult]           = useState<GapResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [tab, setTab]                 = useState<'overview'|'heatmap'|'keywords'>('overview');

  useEffect(() => {
    api.get<Course[]>('/courses/').then(r => setAllCourses(r.data));
  }, []);

  const toggleCourse = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) { setSelectedIds(new Set()); setSelectAll(false); }
    else { setSelectedIds(new Set(allCourses.map(c => c.id))); setSelectAll(true); }
  };

  const handleAnalyze = async () => {
    if (!selectedIds.size || !jobRole.trim()) return;
    setLoading(true); setError(null); setResult(null); setTab('overview');
    try {
      const res = await api.post<GapResult>('/coverage/program-gap', {
        course_ids: Array.from(selectedIds),
        job_role: jobRole.trim(),
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Analysis failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleExportPdf = () => {
    if (!result) return;
    generateAcademicPDF(result, selectedCourses);
  };

  const selectedCourses = allCourses.filter(c => selectedIds.has(c.id));
  const domainPalette = ['#C75B12','#7c3aed','#0284c7','#059669','#d97706','#db2777','#64748b'];
  const domainColorMap: Record<string, string> = {};
  [...new Set(allCourses.map(c => c.domain).filter(Boolean))].forEach((d, i) => {
    domainColorMap[d] = domainPalette[i % domainPalette.length];
  });

  return (
    <div className="p-6 space-y-5 min-h-screen bg-[#F8F6F3]">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Program Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select syllabi, pick a job role, and explore a visual breakdown of program-wide skill coverage.
          </p>
        </div>
        {result && (
          <button onClick={handleExportPdf}
            className="flex items-center gap-2 px-4 py-2 bg-[#1C1C1C] text-white rounded-xl text-sm font-medium hover:bg-black transition">
            ↓ Export PDF
          </button>
        )}
      </div>

      {/* Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Checklist */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Syllabi ({selectedIds.size}/{allCourses.length})
            </p>
            <button onClick={handleSelectAll}
              className="text-xs text-[#C75B12] font-medium hover:underline">
              {selectAll ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {allCourses.length === 0 && (
            <p className="text-xs text-gray-400 py-6 text-center">No syllabi found.</p>
          )}
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
            {allCourses.map(course => {
              const checked = selectedIds.has(course.id);
              const dc = domainColorMap[course.domain] ?? '#94a3b8';
              return (
                <label key={course.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition ${
                    checked ? 'border-[#C75B12]/40 bg-orange-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCourse(course.id)}
                    className="accent-[#C75B12] w-4 h-4 shrink-0" />
                  <div className="w-1.5 h-7 rounded-full shrink-0" style={{ background: dc }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{course.title}</p>
                    {course.domain && <p className="text-[10px] text-gray-400 truncate">{course.domain}</p>}
                  </div>
                  {course.coverage_score != null && (
                    <span className="text-[10px] text-gray-400 shrink-0">{course.coverage_score.toFixed(0)}%</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Role input + CTA */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Target Job Role or Domain
              </label>
              <input type="text" value={jobRole} onChange={e => setJobRole(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                placeholder="e.g. Data Engineer, ML Engineer, Cybersecurity Analyst…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C75B12]/30" />
              <p className="text-[11px] text-gray-400 mt-1.5">
                Analyzes which skills required for this role are covered across all selected syllabi together.
              </p>
            </div>

            {selectedCourses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCourses.map(s => (
                  <span key={s.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-[#C75B12]/10 text-[#C75B12] rounded-lg text-xs font-medium">
                    {s.title}
                    <button onClick={() => toggleCourse(s.id)} className="hover:opacity-60">×</button>
                  </span>
                ))}
              </div>
            )}

            <button onClick={handleAnalyze}
              disabled={loading || !selectedIds.size || !jobRole.trim()}
              className="w-full py-2.5 bg-[#C75B12] text-white rounded-xl text-sm font-semibold hover:bg-[#a84a0e] transition disabled:opacity-40 flex items-center justify-center gap-2">
              {loading
                ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing…</>
                : '📋 Generate Program Report'}
            </button>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
            )}
          </div>

          {/* How-it-works tiles (only pre-result) */}
          {!result && !loading && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Visualizations in this report</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['🍩', 'Coverage Donut',    'Covered vs missing at a glance'],
                  ['📉', 'Coverage Funnel',   'Required → covered → gap waterfall'],
                  ['🌐', 'Polar Contribution','Each syllabuss share, radially'],
                  ['🔲', 'Skill Heatmap',     'Top skills × every course matrix'],
                  ['🏷️', 'Keyword Bubbles',  'Missing & covered skills visually'],
                  ['📊', 'Bar Ranking',       'All syllabi ranked by coverage %'],
                ].map(([icon, title, sub]) => (
                  <div key={title} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="text-base">{icon}</span>
                    <div><p className="font-semibold text-gray-700">{title}</p><p>{sub}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════ REPORT OUTPUT ══════════════ */}
      {result && (
        <div className="space-y-5">

          {result.warning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
              ⚠️ {result.warning}
            </div>
          )}

          {/* ── Row 1: Donut + Funnel + Polar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Donut + stat tiles */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-4">
              <DonutChart
                covered={result.total_covered}
                missing={result.missing_keywords.length}
                total={result.total_required_keywords}
                size={130}
              />
              <div className="w-full grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 rounded-xl py-3 text-center">
                  <p className="text-xl font-black text-emerald-600">{result.total_covered}</p>
                  <p className="text-[10px] text-emerald-700 font-medium">covered</p>
                </div>
                <div className="bg-red-50 rounded-xl py-3 text-center">
                  <p className="text-xl font-black text-red-500">{result.missing_keywords.length}</p>
                  <p className="text-[10px] text-red-600 font-medium">missing</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-gray-800">{result.job_role}</p>
                {result.jobs_matched > 0 && (
                  <p className="text-[10px] text-gray-400">{result.jobs_matched} postings · {result.total_required_keywords} skills required</p>
                )}
              </div>
            </div>

            {/* Funnel + ranked bars */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Coverage Funnel</p>
              <CoverageFunnel result={result} />

              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Syllabi Ranked by Coverage
                </p>
                <div className="space-y-2.5">
                  {result.per_course_breakdown.map((c, i) => (
                    <div key={c.course_id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-gray-400 w-4">#{i+1}</span>
                          <span className="text-xs text-gray-700 truncate">{c.course_name}</span>
                        </div>
                        <span className={`text-xs font-bold shrink-0 ml-2 ${pctClass(c.coverage_pct)}`}>
                          {c.coverage_pct}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StackedBar covered={c.covered_count} total={c.total_required} />
                        <span className="text-[10px] text-gray-400 shrink-0">{c.covered_count}/{c.total_required}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Polar chart */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 self-start">
                Syllabus Contribution (Polar)
              </p>
              {result.per_course_breakdown.length >= 3 ? (
                <PolarChart breakdown={result.per_course_breakdown} />
              ) : (
                <div className="space-y-4 pt-2 w-full">
                  {result.per_course_breakdown.map(c => (
                    <div key={c.course_id} className="flex items-center gap-3">
                      <span className="text-3xl font-black" style={{ color: pctColor(c.coverage_pct) }}>
                        {c.coverage_pct}%
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.course_name}</p>
                        <p className="text-xs text-gray-400">{c.covered_count}/{c.total_required} skills</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-1 text-center">
                Spoke length = coverage %. Outer ring = 100%.
              </p>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="flex gap-1 bg-white rounded-2xl border border-gray-100 p-1 w-fit">
            {([['overview','📊 Top Gaps'],['heatmap','🔲 Skill Heatmap'],['keywords','🏷️ All Keywords']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition ${
                  tab === key ? 'bg-[#C75B12] text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Tab: Top Gaps ── */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
                  Top Missing Skills ({Math.min(result.missing_keywords.length, 40)} of {result.missing_keywords.length})
                </p>
                <p className="text-[10px] text-gray-400 mb-3">
                  Required for <strong>{result.job_role}</strong> · not covered by any selected syllabus · sorted by job frequency.
                </p>
                <KeywordPills keywords={result.missing_keywords} covered={false} />
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">
                  Covered Skills ({Math.min(result.covered_keywords.length, 40)} of {result.covered_keywords.length})
                </p>
                <p className="text-[10px] text-gray-400 mb-3">
                  Required skills already addressed across the selected program syllabi.
                </p>
                <KeywordPills keywords={result.covered_keywords} covered={true} />
              </div>
            </div>
          )}

          {/* ── Tab: Skill Heatmap ── */}
          {tab === 'heatmap' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Skill × Syllabus Heatmap
              </p>
              <p className="text-[10px] text-gray-400 mb-4">
                Top {Math.min(result.missing_keywords.length, 24)} missing skills + {Math.min(result.covered_keywords.length, 8)} covered skills, across all selected syllabi.
                Red = gap, Green = covered, Gray = not required by this role.
              </p>
              <SkillHeatmap
                breakdown={result.per_course_breakdown}
                allMissing={result.missing_keywords}
                allCovered={result.covered_keywords}
              />
            </div>
          )}

          {/* ── Tab: All keywords (scrollable lists) ── */}
          {tab === 'keywords' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">
                  All Missing Skills ({result.missing_keywords.length})
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto">
                  {result.missing_keywords.map((k, i) => (
                    <span key={k} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium">
                      <span className="text-red-300 text-[9px]">#{i+1}</span>{k}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">
                  All Covered Skills ({result.covered_keywords.length})
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto">
                  {result.covered_keywords.map(k => (
                    <span key={k} className="text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}