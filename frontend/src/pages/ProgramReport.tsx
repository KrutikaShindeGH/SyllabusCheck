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
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const pct  = result.total_required_keywords
    ? Math.round(result.total_covered / result.total_required_keywords * 100) : 0;

  const courseRows = result.per_course_breakdown.map((c, i) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${i+1}. ${c.course_name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.domain}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.covered_count}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.total_required}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${pctColor(c.coverage_pct)}">${c.coverage_pct}%</td>
    </tr>`
  ).join('');

  const kwGrid = (kws: string[], color: string, bg: string, border: string) =>
    kws.map((k) =>
      `<span style="display:inline-block;margin:2px 3px;padding:3px 10px;background:${bg};color:${color};border:1px solid ${border};border-radius:20px;font-size:10px;font-family:'Georgia',serif;">${k}</span>`
    ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.6; color: #1a1a2e; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 60px 72px; }
  .report-header { border-bottom: 3px double #1a1a2e; padding-bottom: 20px; margin-bottom: 28px; }
  .institution { font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
  .report-title { font-size: 22pt; font-weight: bold; color: #1a1a2e; line-height: 1.2; margin-bottom: 6px; }
  .report-subtitle { font-size: 12pt; color: #4b5563; font-style: italic; }
  .report-meta { margin-top: 14px; font-size: 9pt; color: #6b7280; display: flex; gap: 24px; }
  h2 { font-size: 13pt; font-weight: bold; color: #1a1a2e; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; margin: 28px 0 14px; }
  h3 { font-size: 11pt; font-weight: bold; color: #374151; margin: 18px 0 8px; }
  .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #1a1a2e; padding: 18px 22px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .summary-stat { text-align: center; }
  .summary-stat .value { font-size: 24pt; font-weight: bold; color: #1a1a2e; line-height: 1; display: block; }
  .summary-stat .label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; display: block; }
  .summary-stat.highlight .value { color: #C75B12; }
  .summary-stat.green .value { color: #059669; }
  .summary-stat.red .value { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 16px; }
  thead tr { background: #1a1a2e; color: white; }
  thead th { padding: 8px 12px; text-align: left; font-size: 9pt; letter-spacing: 0.5px; font-weight: 600; }
  thead th:not(:first-child) { text-align: center; }
  tbody tr:last-child td { border-bottom: 2px solid #1a1a2e; }
  .keyword-section { margin-bottom: 20px; }
  .keyword-section p { font-size: 9.5pt; color: #4b5563; margin-bottom: 10px; font-style: italic; }
  .footer { margin-top: 40px; padding-top: 14px; border-top: 2px solid #1a1a2e; font-size: 8.5pt; color: #9ca3af; display: flex; justify-content: space-between; font-style: italic; }
  .page-break { page-break-before: always; }
  .methodology { background: #fffbeb; border: 1px solid #fde68a; padding: 14px 18px; font-size: 9.5pt; color: #78350f; margin-bottom: 20px; line-height: 1.5; }
  .methodology strong { display: block; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div class="institution">SyllabusCheck · Curriculum Analytics Platform</div>
    <div class="report-title">Program Curriculum Gap Analysis</div>
    <div class="report-subtitle">Target Role: ${result.job_role}</div>
    <div class="report-meta">
      <span>📅 Generated: ${date}</span>
      <span>📊 Based on ${result.jobs_matched} job postings</span>
      <span>📚 ${selectedCourses.length} syllab${selectedCourses.length === 1 ? 'us' : 'i'} analyzed</span>
    </div>
  </div>

  <h2>Executive Summary</h2>
  <div class="summary-box">
    <div class="summary-stat highlight"><span class="value">${pct}%</span><span class="label">Overall Coverage</span></div>
    <div class="summary-stat"><span class="value">${result.total_required_keywords}</span><span class="label">Required Skills</span></div>
    <div class="summary-stat green"><span class="value">${result.total_covered}</span><span class="label">Skills Covered</span></div>
    <div class="summary-stat red"><span class="value">${result.missing_keywords.length}</span><span class="label">Skills Missing</span></div>
  </div>
  <p style="font-size:10pt;color:#374151;margin-bottom:20px;line-height:1.7;">
    This report analyzes the alignment between the selected curriculum and the skill requirements
    extracted from <strong>${result.jobs_matched} job postings</strong> for the role of
    <strong>${result.job_role}</strong>. The program collectively covers
    <strong>${result.total_covered} of ${result.total_required_keywords}</strong> required skills
    (${pct}% coverage), with <strong>${result.missing_keywords.length} skills</strong> currently absent from the curriculum.
  </p>
  <div class="methodology">
    <strong>Methodology Note</strong>
    Skills were extracted from job postings using NLP analysis (Claude Haiku). Coverage was determined
    via semantic similarity matching between syllabus topics and job-required keywords
    (cosine similarity threshold ≥ 0.75 for "covered", ≥ 0.50 for "partial").
    Keywords are ranked by frequency across job postings.
  </div>

  <h2>Per-Syllabus Coverage Breakdown</h2>
  <table>
    <thead><tr><th>Syllabus</th><th>Domain</th><th>Covered</th><th>Required</th><th>Coverage %</th></tr></thead>
    <tbody>${courseRows}</tbody>
  </table>

  <h2>Coverage Funnel Analysis</h2>
  <table style="width:60%;margin-bottom:20px;">
    <thead><tr><th>Stage</th><th>Count</th><th>Percentage</th></tr></thead>
    <tbody>
      <tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">Required by Job Role</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;">${result.total_required_keywords}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">100%</td></tr>
      <tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">Covered by Program</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:#059669;">${result.total_covered}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#059669;">${pct}%</td></tr>
      <tr><td style="padding:6px 12px;border-bottom:2px solid #1a1a2e;">Gap (Missing)</td><td style="padding:6px 12px;border-bottom:2px solid #1a1a2e;text-align:center;font-weight:600;color:#dc2626;">${result.missing_keywords.length}</td><td style="padding:6px 12px;border-bottom:2px solid #1a1a2e;text-align:center;color:#dc2626;">${result.total_required_keywords ? Math.round(result.missing_keywords.length/result.total_required_keywords*100) : 0}%</td></tr>
    </tbody>
  </table>

  <div class="page-break"></div>
  <h2>Missing Skills (${result.missing_keywords.length} skills)</h2>
  <div class="keyword-section">
    <p>Skills required for <em>${result.job_role}</em> roles not currently addressed in any selected syllabus. Sorted by frequency across job postings (most critical first).</p>
    <div>${kwGrid(result.missing_keywords.slice(0, 80), '#991b1b', '#fff1f2', '#fecaca')}</div>
  </div>

  <h2>Covered Skills (${result.covered_keywords.length} skills)</h2>
  <div class="keyword-section">
    <p>Skills required for <em>${result.job_role}</em> roles already addressed within the selected curriculum.</p>
    <div>${kwGrid(result.covered_keywords, '#065f46', '#ecfdf5', '#a7f3d0')}</div>
  </div>

  <div class="page-break"></div>
  <h2>Curriculum Recommendations</h2>
  <h3>High-Priority Additions (Top 10 Missing Skills)</h3>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;">
    The following skills appear most frequently in <strong>${result.job_role}</strong> job postings and represent the highest-impact gaps:
  </p>
  <ol style="padding-left:20px;font-size:10pt;color:#374151;line-height:2;">
    ${result.missing_keywords.slice(0, 10).map((k: string) => `<li><strong>${k}</strong></li>`).join('')}
  </ol>

  <h3>Strengths to Highlight</h3>
  <p style="font-size:10pt;color:#374151;margin-bottom:12px;line-height:1.7;">
    The curriculum demonstrates strong coverage in the following areas relevant to <strong>${result.job_role}</strong>:
  </p>
  <ul style="padding-left:20px;font-size:10pt;color:#374151;line-height:2;">
    ${result.covered_keywords.slice(0, 8).map((k: string) => `<li>${k}</li>`).join('')}
  </ul>

  <h2>Analyzed Syllabi</h2>
  <ol style="padding-left:20px;font-size:10pt;color:#374151;line-height:2;">
    ${selectedCourses.map((c: Course) =>
      `<li><strong>${c.title}</strong>${c.domain ? ` — <em>${c.domain}</em>` : ''}${c.coverage_score != null ? ` (individual coverage: ${c.coverage_score.toFixed(0)}%)` : ''}</li>`
    ).join('')}
  </ol>

  <div class="footer">
    <span>SyllabusCheck · Program Gap Analysis Report</span>
    <span>${date}</span>
    <span>Confidential — For Academic Use Only</span>
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.onload = () => {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 500);
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
