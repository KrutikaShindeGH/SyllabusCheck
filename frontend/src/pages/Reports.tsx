import { useEffect, useRef, useState } from "react";
import api from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Course {
  id: string;
  title: string;
  code: string;
  domain: string;
  coverage_score: number | null;
}

interface CoverageRow {
  keyword_text: string;
  category: string;
  status: "covered" | "partial" | "missing";
  frequency: number;
  similarity_score: number | null;
}

interface CourseReport {
  course: Course;
  coverage: CoverageRow[];
  ai_summary: string | null;
  report_id: string | null;
  pdf_path: string | null;
  xlsx_path: string | null;
  generated_at: string | null;
}

// ── Authenticated Excel download ──────────────────────────────────────────────

async function downloadExcel(reportId: string) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`/api/reports/${reportId}/download/xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { alert("Download failed — please regenerate the report."); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `syllacheck_${reportId.slice(0, 8)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── UI-capture PDF download ───────────────────────────────────────────────────

async function downloadUIPdf(element: HTMLElement, filename: string) {
  // @ts-ignore
  const html2pdf = (await import("html2pdf.js")).default;
  await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(element)
    .save();
}

// ── Pie chart (Canvas) ────────────────────────────────────────────────────────

function PieChart({ covered, partial, missing }: { covered: number; partial: number; missing: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const total = covered + partial + missing || 1;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = 60, cy = 60, r = 50;
    const slices = [
      { value: covered, color: "#10b981" },
      { value: partial,  color: "#f59e0b" },
      { value: missing,  color: "#ef4444" },
    ];

    ctx.clearRect(0, 0, 120, 120);
    let start = -Math.PI / 2;
    slices.forEach(({ value, color }) => {
      if (value === 0) return;
      const angle = (value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      start += angle;
    });

    // Center hole
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, 2 * Math.PI);
    ctx.fillStyle = "#f9fafb";
    ctx.fill();

    // Center text
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round((covered / total) * 100)}%`, cx, cy);
  }, [covered, partial, missing]);

  return <canvas ref={ref} width={120} height={120} />;
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function CategoryBars({ coverage }: { coverage: CoverageRow[] }) {
  const missing = coverage.filter(r => r.status === "missing");
  const catMap: Record<string, number> = {};
  missing.forEach(r => {
    const cat = r.category || "Other";
    catMap[cat] = (catMap[cat] || 0) + 1;
  });
  const sorted = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(([cat, count]) => (
        <div key={cat}>
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span className="truncate max-w-[140px]">{cat}</span>
            <span className="font-medium">{count}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-red-400"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">No missing skills data</p>
      )}
    </div>
  );
}

// ── Course tab panel ──────────────────────────────────────────────────────────

function CoursePanel({
  courseReport,
  onGenerate,
}: {
  courseReport: CourseReport;
  onGenerate: (courseId: string) => Promise<void>;
}) {
  const { course, coverage, ai_summary, report_id, pdf_path, xlsx_path, generated_at } = courseReport;
  const [generating, setGenerating] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);

  // Ref for UI-capture PDF
  const printRef = useRef<HTMLDivElement>(null);

  const covered = coverage.filter(r => r.status === "covered").length;
  const partial  = coverage.filter(r => r.status === "partial").length;
  const missing  = coverage.filter(r => r.status === "missing").length;
  const total    = coverage.length;
  const score    = course.coverage_score ?? 0;

  const topMissing = coverage
    .filter(r => r.status === "missing")
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 8);

  const handleGenerate = async () => {
    setGenerating(true);
    try { await onGenerate(course.id); }
    finally { setGenerating(false); }
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);
    try {
      const filename = `syllacheck_${(course.code || course.title).replace(/\s+/g, "_")}.pdf`;
      await downloadUIPdf(printRef.current, filename);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!report_id) return;
    setDownloadingXlsx(true);
    try { await downloadExcel(report_id); }
    finally { setDownloadingXlsx(false); }
  };

  return (
    <div className="space-y-5">

      {/* ── Printable area (captured for PDF) ── */}
      <div ref={printRef} className="space-y-5 bg-white">

        {/* PDF header — only visible in PDF (hidden on screen via print-only class) */}
        <div className="hidden print-pdf-header" style={{ display: "none" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 2 }}>
            SyllabusCheck — Gap Analysis Report
          </h1>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            {course.title} {course.code ? `· ${course.code}` : ""} {course.domain ? `· ${course.domain}` : ""}
          </p>
          {generated_at && (
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
              Generated {new Date(generated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          <hr style={{ margin: "12px 0", borderColor: "#e5e7eb" }} />
        </div>

        {/* AI Summary */}
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#C75B12]" />
            <span className="text-[11px] font-semibold text-[#C75B12] uppercase tracking-wider">
              AI Summary — GPT-4o
            </span>
          </div>
          {ai_summary ? (
            <p className="text-sm text-gray-700 leading-relaxed">{ai_summary}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Generate a report below to get an AI-powered gap analysis for this course.
            </p>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Coverage score", value: `${score.toFixed(1)}%`, cls: "text-[#C75B12]" },
            { label: "Covered",  value: covered, cls: "text-emerald-600" },
            { label: "Partial",  value: partial,  cls: "text-amber-500" },
            { label: "Missing",  value: missing,  cls: "text-red-500" },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3 text-center">
              <div className={`text-2xl font-bold ${m.cls}`}>{m.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        {total > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Coverage breakdown</p>
              <div className="flex items-center gap-4">
                <PieChart covered={covered} partial={partial} missing={missing} />
                <div className="flex flex-col gap-2 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    Covered ({Math.round((covered / total) * 100)}%)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    Partial ({Math.round((partial / total) * 100)}%)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    Missing ({Math.round((missing / total) * 100)}%)
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Top missing categories</p>
              <CategoryBars coverage={coverage} />
            </div>
          </div>
        )}

        {/* Top missing skills table */}
        {topMissing.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              Top missing skills by job frequency
            </p>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-3 py-2 font-medium">Skill</th>
                    <th className="text-left px-3 py-2 font-medium">Category</th>
                    <th className="text-right px-3 py-2 font-medium">Job freq.</th>
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topMissing.map((row, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 text-gray-800 font-medium">{row.keyword_text}</td>
                      <td className="px-3 py-2 text-gray-500">{row.category || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-purple-600">{row.frequency}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
                          Missing
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
      {/* ── End printable area ── */}

      {/* Generate + Download buttons (NOT captured in PDF) */}
      <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-[#C75B12] text-white text-sm font-semibold rounded-lg hover:bg-[#a34a0e] transition disabled:opacity-50 flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
              Generating…
            </>
          ) : (
            <>⚡ {report_id ? "Regenerate" : "Generate"} Report</>
          )}
        </button>

        {/* PDF — captures the UI above */}
        <button
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {downloadingPdf ? (
            <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
          ) : "↓"} PDF
        </button>

        {/* Excel — still uses backend-generated file */}
        {report_id && xlsx_path && (
          <button
            onClick={handleDownloadExcel}
            disabled={downloadingXlsx}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {downloadingXlsx ? (
              <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
            ) : "↓"} Excel
          </button>
        )}

        {generated_at && (
          <span className="text-xs text-gray-400 ml-auto">
            Last generated {new Date(generated_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const [courseReports, setCourseReports] = useState<CourseReport[]>([]);
  const [activeTab, setActiveTab]         = useState(0);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [coursesRes, reportsRes] = await Promise.all([
        api.get("/courses/"),
        api.get("/reports/"),
      ]);

      const courses: Course[]  = coursesRes.data;
      const reports: any[]     = reportsRes.data;

      const built: CourseReport[] = await Promise.all(
        courses.map(async (course) => {
          const latestReport = reports.find(
            r => r.summary?.total_courses === 1 &&
                 JSON.stringify(r.filters?.course_ids) === JSON.stringify([course.id])
          ) ?? null;

          let coverage: CoverageRow[] = [];
          try {
            const covRes = await api.get(`/coverage/${course.id}`);
            const raw = covRes.data;
            coverage = Array.isArray(raw)
              ? raw
              : (raw?.items ?? raw?.coverage_rows ?? raw?.rows ?? raw?.data ?? []);
          } catch {
            coverage = [];
          }

          return {
            course,
            coverage,
            ai_summary:   latestReport?.summary?.ai_summary ?? null,
            report_id:    latestReport?.id ?? null,
            pdf_path:     latestReport?.pdf_path ?? null,
            xlsx_path:    latestReport?.xlsx_path ?? null,
            generated_at: latestReport?.created_at ?? null,
          };
        })
      );

      setCourseReports(built);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async (courseId: string) => {
    const idx = courseReports.findIndex(cr => cr.course.id === courseId);
    if (idx === -1) return;

    try {
      const res = await api.post("/reports/generate", {
        course_ids: [courseId],
        include_charts: true,
      });
      const newReport = res.data;

      setCourseReports(prev =>
        prev.map(cr =>
          cr.course.id === courseId
            ? {
                ...cr,
                ai_summary:   newReport.summary?.ai_summary ?? cr.ai_summary,
                report_id:    newReport.id,
                pdf_path:     newReport.pdf_path,
                xlsx_path:    newReport.xlsx_path,
                generated_at: newReport.created_at,
              }
            : cr
        )
      );
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to generate report");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin w-7 h-7 border-4 border-[#C75B12] border-t-transparent rounded-full" />
        <span className="ml-3 text-gray-500 text-sm">Loading courses…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      </div>
    );
  }

  if (courseReports.length === 0) {
    return (
      <div className="p-6 text-center py-32">
        <div className="text-4xl mb-3">📚</div>
        <p className="text-gray-500 font-medium">No courses found</p>
        <p className="text-gray-400 text-sm mt-1">Upload a syllabus in the Syllabi page first.</p>
      </div>
    );
  }

  const active = courseReports[activeTab];

  return (
    <div className="p-6 space-y-0">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Per-course gap analysis with AI summaries, charts, and downloads
          </p>
        </div>
        <button
          onClick={() => {
            if (!confirm(`Generate reports for all ${courseReports.length} courses?`)) return;
            courseReports.forEach(cr => handleGenerate(cr.course.id));
          }}
          className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition"
        >
          ⚡ Generate All
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto">
        {courseReports.map((cr, i) => (
          <button
            key={cr.course.id}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition font-medium ${
              i === activeTab
                ? "border-[#C75B12] text-[#C75B12]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {cr.course.title}
            {cr.report_id && (
              <span className="ml-2 w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="bg-white border border-t-0 border-gray-200 rounded-b-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">{active.course.title}</h2>
            <p className="text-xs text-gray-400">
              {[active.course.code, active.course.domain].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <CoursePanel
          courseReport={active}
          onGenerate={handleGenerate}
        />
      </div>
    </div>
  );
}

