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

// ─── 6. Keyword bubble cloud ───────────────────────────────────────────────────
function BubbleCloud({ keywords, covered }: { keywords: string[]; covered: boolean }) {
  const shown = keywords.slice(0, 36);
  const cols  = 5;
  const rows  = Math.ceil(shown.length / cols);
  const W = 310, H = Math.max(rows * 42, 42);
  const color  = covered ? '#059669' : '#dc2626';
  const bg     = covered ? '#d1fae5' : '#fee2e2';
  const border = covered ? '#6ee7b7' : '#fca5a5';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {shown.map((kw, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = col * (W / cols) + (W / cols) / 2;
        const y   = row * 42 + 21;
        const w   = Math.min(kw.length * 6.0 + 16, W / cols - 4);
        return (
          <g key={kw}>
            <rect x={x - w/2} y={y - 13} width={w} height={26} rx={13}
              fill={bg} stroke={border} strokeWidth={1} />
            <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={9.5} fontWeight="600" fill={color}>
              {kw.length > 17 ? kw.slice(0, 16) + '…' : kw}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
  const reportRef = useRef<HTMLDivElement>(null);

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

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    // @ts-ignore
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf().set({
      margin: [8, 8, 8, 8], filename: `program_report_${jobRole.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.97 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(reportRef.current).save();
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
                  ['🌐', 'Polar Contribution','Each syllabus\'s share, radially'],
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
        <div ref={reportRef} className="space-y-5">

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

          {/* ── Tab: Top Gaps — bubble clouds ── */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
                  Top Missing Skills ({Math.min(result.missing_keywords.length, 36)} of {result.missing_keywords.length})
                </p>
                <p className="text-[10px] text-gray-400 mb-3">
                  Required for <strong>{result.job_role}</strong> · not covered by any selected syllabus · sorted by job frequency.
                </p>
                <BubbleCloud keywords={result.missing_keywords} covered={false} />
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">
                  Covered Skills ({Math.min(result.covered_keywords.length, 36)} of {result.covered_keywords.length})
                </p>
                <p className="text-[10px] text-gray-400 mb-3">
                  Required skills already addressed across the selected program syllabi.
                </p>
                <BubbleCloud keywords={result.covered_keywords} covered={true} />
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

