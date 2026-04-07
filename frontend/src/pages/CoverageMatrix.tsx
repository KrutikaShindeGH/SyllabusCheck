import { useEffect, useState } from "react";
import api from "../lib/api";

interface KeywordDetail {
  id: string;
  text: string;
  category: string;
  domain: string;
  subdomain?: string;
  frequency: number;
}

interface CourseSummary {
  covered: number;
  partial: number;
  missing: number;
  total: number;
}

interface CourseDetail {
  id: string;
  title: string;
  code: string;
  coverage_score: number;
  domain: string;
  keywords: KeywordDetail[];
  summary: CourseSummary;
}

interface Cell {
  status: "covered" | "partial" | "missing";
  score: number;
}

interface MatrixData {
  course_details: CourseDetail[];
  cells: Record<string, Cell>;
}

const STATUS_COLOR = {
  covered: { bg: "bg-emerald-500", text: "text-emerald-600", light: "bg-emerald-50" },
  partial: { bg: "bg-amber-400",   text: "text-amber-600",   light: "bg-amber-50" },
  missing: { bg: "bg-red-400",     text: "text-red-600",     light: "bg-red-50" },
};

const SCORE_COLOR = (score: number) => {
  if (score >= 60) return { ring: "stroke-emerald-500", text: "text-emerald-600" };
  if (score >= 30) return { ring: "stroke-amber-400",   text: "text-amber-600" };
  return             { ring: "stroke-red-400",     text: "text-red-600" };
};

function ScoreRing({ score }: { score: number }) {
  const pct   = Math.min(Math.max(score, 0), 100);
  const r     = 28, cx = 36, cy = 36;
  const circ  = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const col   = SCORE_COLOR(pct);
  return (
    <svg width={72} height={72} className="-rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        className={col.ring} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text
        x={cx} y={cy + 5} textAnchor="middle"
        className={`text-[11px] font-bold fill-current ${col.text}`}
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px` }}
      >
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

function MiniBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-gray-500 shrink-0">{value}</span>
    </div>
  );
}

function CourseCard({ course, cells, expanded, onToggle }: {
  course: CourseDetail;
  cells: Record<string, Cell>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { summary, keywords } = course;
  const coveredKws  = keywords.filter(k => cells[`${course.id}_${k.id}`]?.status === "covered");
  const partialKws  = keywords.filter(k => cells[`${course.id}_${k.id}`]?.status === "partial");
  const missingKws  = keywords.filter(k => cells[`${course.id}_${k.id}`]?.status === "missing");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="p-5 flex items-start gap-4">
        {/* Score ring */}
        <div className="shrink-0">
          <ScoreRing score={course.coverage_score} />
        </div>

        {/* Course info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-gray-800 text-base leading-tight">
                {course.title}
                {course.code && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">{course.code}</span>
                )}
              </h3>
              <span className="inline-block mt-1 text-[11px] bg-[#C75B12]/10 text-[#C75B12] px-2 py-0.5 rounded-full font-medium">
                {course.domain}
              </span>
            </div>
            <button
              onClick={onToggle}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition font-medium"
            >
              {expanded ? "▲ Hide" : "▼ Details"}
            </button>
          </div>

          {/* Coverage bars */}
          <div className="mt-3 space-y-1.5">
            <MiniBar label="Covered"  value={summary.covered} total={summary.total} color="bg-emerald-500" />
            <MiniBar label="Partial"  value={summary.partial} total={summary.total} color="bg-amber-400" />
            <MiniBar label="Missing"  value={summary.missing} total={summary.total} color="bg-red-400" />
          </div>

          {/* Summary chips */}
          <div className="flex gap-2 mt-3">
            {[
              { label: `${summary.covered} covered`,  color: "bg-emerald-100 text-emerald-700" },
              { label: `${summary.partial} partial`,  color: "bg-amber-100 text-amber-700" },
              { label: `${summary.missing} missing`,  color: "bg-red-100 text-red-700" },
              { label: `${summary.total} total`,      color: "bg-gray-100 text-gray-600" },
            ].map(c => (
              <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.color}`}>
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded keyword list */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">

          {/* Covered keywords */}
          {coveredKws.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  Covered Skills ({coveredKws.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {coveredKws.map(k => {
                  const cell = cells[`${course.id}_${k.id}`];
                  return (
                    <span
                      key={k.id}
                      title={`${k.text} — similarity: ${cell ? (cell.score * 100).toFixed(0) : 0}% | ${k.frequency} jobs`}
                      className="text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium cursor-default hover:bg-emerald-100 transition"
                    >
                      {k.text}
                      <span className="ml-1 text-emerald-400 text-[9px]">{k.frequency}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Partial keywords */}
          {partialKws.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  Partially Covered ({partialKws.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {partialKws.slice(0, 20).map(k => (
                  <span
                    key={k.id}
                    title={`${k.text} | ${k.frequency} jobs`}
                    className="text-[11px] px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium cursor-default hover:bg-amber-100 transition"
                  >
                    {k.text}
                    <span className="ml-1 text-amber-400 text-[9px]">{k.frequency}</span>
                  </span>
                ))}
                {partialKws.length > 20 && (
                  <span className="text-[11px] px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                    +{partialKws.length - 20} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Top missing keywords */}
          {missingKws.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                  Top Missing Skills ({missingKws.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingKws.slice(0, 15).map(k => (
                  <span
                    key={k.id}
                    title={`${k.text} | ${k.frequency} jobs require this`}
                    className="text-[11px] px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium cursor-default hover:bg-red-100 transition"
                  >
                    {k.text}
                    <span className="ml-1 text-red-400 text-[9px]">{k.frequency}</span>
                  </span>
                ))}
                {missingKws.length > 15 && (
                  <span className="text-[11px] px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                    +{missingKws.length - 15} more — see Gap Analysis
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoverageMatrix() {
  const [data, setData]           = useState<MatrixData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [limit, setLimit]         = useState(50);
  const [expandedIds, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/coverage/matrix?limit=${limit}`)
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.detail || "Failed to load coverage data"))
      .finally(() => setLoading(false));
  }, [limit]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (data) setExpanded(new Set(data.course_details.map(c => c.id)));
  };
  const collapseAll = () => setExpanded(new Set());

  const courses = data?.course_details ?? [];
  const cells   = data?.cells ?? {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coverage Matrix</h1>
          <p className="text-sm text-gray-500 mt-1">
            Skill coverage per course — domain-scoped keywords from real job postings
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Keywords per course:</span>
            {[30, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  limit === n ? "bg-[#C75B12] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {courses.length > 0 && (
            <div className="flex gap-2">
              <button onClick={expandAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition">
                Expand All
              </button>
              <button onClick={collapseAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition">
                Collapse All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-500 flex-wrap">
        {[
          { color: "bg-emerald-500", label: "Covered (similarity > 0.8)" },
          { color: "bg-amber-400",   label: "Partial (0.5 – 0.8)" },
          { color: "bg-red-400",     label: "Missing (< 0.5)" },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${l.color}`} />
            {l.label}
          </span>
        ))}
        <span className="text-gray-400">· Hover keywords for similarity score</span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-4 border-[#C75B12] border-t-transparent rounded-full" />
          <span className="ml-3 text-gray-500 text-sm">Loading coverage data…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && courses.length === 0 && (
        <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-400 text-lg font-medium">No courses yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Upload a syllabus and click (Re)Compute Coverage in Gap Analysis.
          </p>
        </div>
      )}

      {/* Course tiles */}
      {!loading && !error && courses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {courses.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              cells={cells}
              expanded={expandedIds.has(course.id)}
              onToggle={() => toggleExpand(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


