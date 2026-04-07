import { useEffect, useState } from "react";
import api from "../lib/api";

interface Course {
  id: string;
  title: string;
  code: string;
  domain: string;
  status: string;
  coverage_score: number | null;
}

interface GapKeyword {
  keyword_id: string;
  keyword: string;
  category: string;
  domain: string;
  frequency: number;
  is_emerging: boolean;
  status: "missing" | "partial";
  score: number;
  tier: string;
}

interface GapReport {
  course_id: string;
  coverage_score: number;
  summary: { covered: number; partial: number; missing: number; total: number };
  gaps: {
    critical: GapKeyword[];
    high: GapKeyword[];
    medium: GapKeyword[];
    low: GapKeyword[];
  };
  total_gaps: number;
}

const TIER_CONFIG = {
  critical: { label: "Critical Gaps",   color: "bg-red-50 border-red-200",      badge: "bg-red-100 text-red-700",      dot: "bg-red-500" },
  high:     { label: "High Priority",   color: "bg-orange-50 border-orange-200", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  medium:   { label: "Medium Priority", color: "bg-amber-50 border-amber-200",   badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-400" },
  low:      { label: "Low Priority",    color: "bg-gray-50 border-gray-200",     badge: "bg-gray-100 text-gray-600",    dot: "bg-gray-400" },
};

// How many to show per tier (critical is capped at 10)
const TIER_LIMITS: Record<string, number> = {
  critical: 10,
  high:     20,
  medium:   20,
  low:      20,
};

function ScoreRing({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";
  const r = 36, c = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={c * 2} height={c * 2} className="-rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x={c} y={c + 6} textAnchor="middle"
        fill={color} fontSize={16} fontWeight={700}
        style={{ transform: `rotate(90deg)`, transformOrigin: `${c}px ${c}px` }}>
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

function KeywordCard({ kw }: { kw: GapKeyword }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-gray-100 hover:border-gray-200 transition">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${kw.status === "partial" ? "bg-amber-400" : "bg-red-400"}`} />
        <span className="font-medium text-gray-800 truncate">{kw.keyword}</span>
        {kw.is_emerging && (
          <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
            Emerging
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{kw.domain}</span>
        <span className="text-xs text-gray-500">{kw.frequency} jobs</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          kw.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
        }`}>
          {kw.status}
        </span>
      </div>
    </div>
  );
}

export default function GapAnalysis() {
  const [courses, setCourses]        = useState<Course[]>([]);
  const [selectedId, setSelected]    = useState<string>("");
  const [report, setReport]          = useState<GapReport | null>(null);
  const [loading, setLoading]        = useState(false);
  const [computing, setComputing]    = useState(false);
  const [error, setError]            = useState<string | null>(null);
  const [expandedTiers, setExpanded] = useState<Set<string>>(new Set(["critical", "high"]));

  useEffect(() => {
    api.get("/courses/").then((r) => {
      setCourses(r.data);
      const parsed = r.data.find((c: Course) => c.status === "parsed");
      if (parsed) setSelected(parsed.id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setReport(null);
    setError(null);
    setLoading(true);
    api.get(`/coverage/${selectedId}/gaps`)
      .then((r) => setReport(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Failed to load gap analysis"))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const handleCompute = async () => {
    if (!selectedId) return;
    setComputing(true);
    setError(null);
    try {
      await api.post(`/coverage/${selectedId}/compute`);
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const r = await api.get(`/coverage/${selectedId}/gaps`);
          if (r.data.total_gaps > 0 || r.data.summary.total > 0) {
            setReport(r.data);
            setComputing(false);
            clearInterval(poll);
          }
        } catch {}
        if (attempts > 40) {
          setComputing(false);
          setError("Coverage computation is taking longer than expected. Check worker logs.");
          clearInterval(poll);
        }
      }, 3000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to trigger computation");
      setComputing(false);
    }
  };

  const toggleTier = (tier: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
  };

  const selectedCourse = courses.find((c) => c.id === selectedId);
  const courseDomain = selectedCourse?.domain ?? "";
  const noData = report && report.summary.total === 0;

  // Filter gaps to only show keywords from the course's own domain, sorted by frequency desc
  const filterAndLimit = (items: GapKeyword[], tier: string): GapKeyword[] => {
  // courseDomain may be "Information Systems/AI/ML" — extract the base domain
  // and also accept CS subdomains for IS/AI/ML type courses
  const baseDomain = courseDomain?.split("/")[0] ?? "";
  const domainFiltered = courseDomain
    ? items.filter((k) =>
        k.domain === courseDomain ||           // exact match
        k.domain === baseDomain ||             // base domain match (e.g. "Information Systems")
        k.domain === "Computer Science"        // CS keywords included for IS/AI/ML courses
      )
    : items;
  const sorted = [...domainFiltered].sort((a, b) => b.frequency - a.frequency);
  return sorted.slice(0, TIER_LIMITS[tier] ?? 20);
};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gap Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">
            See which in-demand skills your syllabus is missing
          </p>
          {/* Domain context pill */}
          {courseDomain && (
            <span className="inline-block mt-2 text-xs bg-[#C75B12]/10 text-[#C75B12] px-2.5 py-1 rounded-full font-medium">
              Showing gaps for: {courseDomain?.replace("/", " → ")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedId}
            onChange={(e) => setSelected(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#C75B12]"
          >
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ` : ""}{c.title}
              </option>
            ))}
          </select>

          <button
            onClick={handleCompute}
            disabled={!selectedId || computing}
            className="px-4 py-2 bg-[#C75B12] text-white rounded-lg text-sm font-medium hover:bg-[#a84d0f] transition disabled:opacity-40 flex items-center gap-2"
          >
            {computing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Computing…
              </>
            ) : (
              "⟳ (Re)Compute Coverage"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#C75B12] border-t-transparent rounded-full" />
          <span className="ml-3 text-gray-500 text-sm">Loading gap report…</span>
        </div>
      )}

      {!loading && noData && (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-100">
          <p className="text-gray-400 text-lg">No coverage data yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Click <strong>(Re)Compute Coverage</strong> to analyse this course.
          </p>
        </div>
      )}

      {!loading && report && !noData && (
        <>
          {/* Score + Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="col-span-2 md:col-span-1 bg-white rounded-xl border border-gray-100 p-4 flex flex-col items-center justify-center gap-1">
              <ScoreRing score={report.coverage_score} />
              <p className="text-xs text-gray-500 mt-1 font-medium">Coverage Score</p>
            </div>
            {[
              { label: "Covered",      value: report.summary.covered, color: "text-emerald-600" },
              { label: "Partial",      value: report.summary.partial, color: "text-amber-500" },
              { label: "Missing",      value: report.summary.missing, color: "text-red-500" },
              { label: "Total Skills", value: report.summary.total,   color: "text-gray-700" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-xs text-gray-500 mt-1">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Gap tiers */}
          {(["critical"] as const).map((tier) => {
            const rawItems = report.gaps[tier];
            const items = filterAndLimit(rawItems, tier);
            if (items.length === 0) return null;
            const cfg = TIER_CONFIG[tier];
            const open = expandedTiers.has(tier);
            const isCapped = tier === "critical" && rawItems.length > 10;

            return (
              <div key={tier} className={`rounded-xl border ${cfg.color} overflow-hidden`}>
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-left hover:opacity-80 transition"
                  onClick={() => toggleTier(tier)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="font-semibold text-gray-800">{cfg.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                      {items.length} skills
                    </span>
                    {isCapped && (
                      <span className="text-xs text-gray-400 italic">
                        (top 10 of {rawItems.filter(k => !courseDomain || k.domain === courseDomain).length} in {courseDomain})
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
                </button>

                {open && (
                  <div className="px-5 pb-4 space-y-1.5 max-h-96 overflow-y-auto">
                    {items.map((kw) => (
                      <KeywordCard key={kw.keyword_id} kw={kw} />
                    ))}
                    {isCapped && (
                      <p className="text-xs text-gray-400 text-center pt-2">
                        Showing top 10 most frequent critical gaps in {courseDomain}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}