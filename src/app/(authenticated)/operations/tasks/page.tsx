"use client";

/**
 * TASKS — Operations & Safety Work Items
 *
 * Features:
 *  • KPI strip: total / pending / overdue / done today
 *  • Inline "New Task" form (no modal needed)
 *  • Filter tabs: ALL | MINE | PENDING | IN PROGRESS | OVERDUE | COMPLETED
 *  • Cards with left priority strip + category icon
 *  • Start → In Progress → Complete inline actions
 *  • Delete button per task
 *  • Auto-generated tasks highlighted with AUTO badge
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckSquare, Plus, X, ChevronDown, ChevronUp,
  Clock, User as UserIcon, MapPin, AlertTriangle,
  Loader2, Trash2, Play, Check, RefreshCw, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface TaskUser { id: string; name: string; role: string; }
interface TaskSite { code: string; name: string; }

interface Task {
  id:             string;
  title:          string;
  description:    string | null;
  category:       string;
  priority:       string;
  status:         string;
  dueDate:        string | null;
  completedAt:    string | null;
  isAutoAssigned: boolean;
  createdAt:      string;
  site?:          TaskSite | null;
  assignee?:      TaskUser | null;
}

interface Stats {
  total:          number;
  pending:        number;
  inProgress:     number;
  overdue:        number;
  completedToday: number;
}

type FilterKey = "ALL" | "MINE" | "PENDING" | "IN_PROGRESS" | "OVERDUE" | "COMPLETED";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "SAFETY",             label: "Safety",             icon: "🛡️" },
  { value: "MAINTENANCE",        label: "Maintenance",        icon: "🔧" },
  { value: "INSPECTION",         label: "Inspection",         icon: "🔍" },
  { value: "INCIDENT_FOLLOWUP",  label: "Incident Follow-up", icon: "🚨" },
  { value: "TRAINING",           label: "Training",           icon: "📚" },
  { value: "ENVIRONMENTAL",      label: "Environmental",      icon: "🌱" },
  { value: "OTHER",              label: "Other",              icon: "📋" },
];

const PRIORITIES = [
  { value: "LOW",      label: "Low",      color: "bg-green-500" },
  { value: "MEDIUM",   label: "Medium",   color: "bg-yellow-500" },
  { value: "HIGH",     label: "High",     color: "bg-orange-500" },
  { value: "CRITICAL", label: "Critical", color: "bg-red-500" },
];

const PRIORITY_BADGE: Record<string, string> = {
  LOW:      "border-green-500/40  text-green-400",
  MEDIUM:   "border-yellow-500/40 text-yellow-400",
  HIGH:     "border-orange-500/40 text-orange-400",
  CRITICAL: "border-red-500/40    text-red-400",
};

const PRIORITY_STRIP: Record<string, string> = {
  LOW:      "bg-green-500",
  MEDIUM:   "bg-yellow-500",
  HIGH:     "bg-orange-500",
  CRITICAL: "bg-red-500",
};

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "ALL",         label: "All"         },
  { key: "MINE",        label: "Mine"        },
  { key: "PENDING",     label: "Pending"     },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "OVERDUE",     label: "Overdue"     },
  { key: "COMPLETED",   label: "Completed"   },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function catInfo(value: string) {
  return CATEGORIES.find((c) => c.value === value) ?? { icon: "📋", label: value };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function isOverdue(task: Task): boolean {
  return !!task.dueDate && task.status !== "COMPLETED" && new Date(task.dueDate) < new Date();
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [members,      setMembers]      = useState<TaskUser[]>([]);
  const [sites,        setSites]        = useState<{ id: string; code: string; name: string }[]>([]);
  const [filter,       setFilter]       = useState<FilterKey>("ALL");
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [actionId,     setActionId]     = useState<string | null>(null); // spinner per card
  const [simulating,   setSimulating]   = useState(false);

  // ── New Task form state ──────────────────────────────────
  const [fTitle,    setFTitle]    = useState("");
  const [fCategory, setFCategory] = useState("SAFETY");
  const [fPriority, setFPriority] = useState("MEDIUM");
  const [fDesc,     setFDesc]     = useState("");
  const [fDue,      setFDue]      = useState("");
  const [fSite,     setFSite]     = useState("");
  const [fAssignee, setFAssignee] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);

  // ── Load tasks ───────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === "MINE")        params.set("mine",   "1");
    else if (filter === "OVERDUE") params.set("overdue","1");
    else if (filter !== "ALL")     params.set("status", filter);

    const r = await fetch(`/api/tasks?${params}`);
    const j = await r.json();
    if (j.ok) setTasks(j.data.tasks ?? []);
    setLoading(false);
  }, [filter]);

  const loadStats = useCallback(async () => {
    const r = await fetch("/api/tasks?stats=1");
    const j = await r.json();
    if (j.ok) setStats(j.data);
  }, []);

  const loadMembers = useCallback(async () => {
    const r = await fetch("/api/tasks?members=1");
    const j = await r.json();
    if (j.ok) setMembers(j.data.users ?? []);
  }, []);

  const loadSites = useCallback(async () => {
    const r = await fetch("/api/sites");
    const j = await r.json();
    if (j.ok) setSites((j.data ?? []).map((s: { id: string; code: string; name: string }) => ({ id: s.id, code: s.code, name: s.name })));
  }, []);

  useEffect(() => {
    loadTasks();
    loadStats();
  }, [loadTasks, loadStats]);

  useEffect(() => {
    loadMembers();
    loadSites();
  }, [loadMembers, loadSites]);

  // Focus title when form opens
  useEffect(() => {
    if (showForm) setTimeout(() => titleRef.current?.focus(), 80);
  }, [showForm]);

  // ── Run / clear simulation ───────────────────────────
  async function runSimulation() {
    if (!confirm("This will create 11 sample tasks to demonstrate the page. Continue?")) return;
    setSimulating(true);
    await fetch("/api/tasks/simulate", { method: "POST" });
    await Promise.all([loadTasks(), loadStats()]);
    setSimulating(false);
  }

  async function clearSimulation() {
    setSimulating(true);
    await fetch("/api/tasks/simulate", { method: "DELETE" });
    await Promise.all([loadTasks(), loadStats()]);
    setSimulating(false);
  }

  const hasSimTasks = tasks.some((t) => t.title.startsWith("[SIM]"));

  // ── Create task ──────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) return;
    setSubmitting(true);
    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:      fTitle.trim(),
        category:   fCategory,
        priority:   fPriority,
        description: fDesc.trim() || undefined,
        dueDate:    fDue || undefined,
        siteId:     fSite     || undefined,
        assigneeId: fAssignee || undefined,
      }),
    });
    const j = await r.json();
    if (j.ok) {
      setFTitle(""); setFCategory("SAFETY"); setFPriority("MEDIUM");
      setFDesc(""); setFDue(""); setFSite(""); setFAssignee("");
      setShowForm(false);
      await Promise.all([loadTasks(), loadStats()]);
    }
    setSubmitting(false);
  }

  // ── Update status ────────────────────────────────────────
  async function updateStatus(id: string, status: string) {
    setActionId(id);
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await Promise.all([loadTasks(), loadStats()]);
    setActionId(null);
  }

  // ── Delete task ──────────────────────────────────────────
  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    setActionId(id);
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    await Promise.all([loadTasks(), loadStats()]);
    setActionId(null);
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <CheckSquare className="h-7 w-7 text-primary" />
            Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Safety &amp; operations work items · auto-generated and manual
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Simulate / Clear buttons */}
          {hasSimTasks ? (
            <button
              onClick={clearSimulation}
              disabled={simulating}
              title="Remove all simulation tasks"
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {simulating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <X className="h-3.5 w-3.5" />
              }
              {simulating ? "Clearing…" : "Clear Sim"}
            </button>
          ) : (
            <button
              onClick={runSimulation}
              disabled={simulating}
              title="Load sample tasks for demonstration"
              className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
            >
              {simulating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FlaskConical className="h-3.5 w-3.5" />
              }
              {simulating ? "Loading…" : "Simulate"}
            </button>
          )}

          {/* New Task button */}
          <button
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              showForm
                ? "bg-muted text-muted-foreground border border-border"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {showForm
              ? <><X className="h-4 w-4" /> Cancel</>
              : <><Plus className="h-4 w-4" /> New Task</>
            }
          </button>
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi icon="📊" label="Total"       value={stats?.total          ?? 0} tone="neutral" />
        <Kpi icon="⏳" label="Pending"     value={stats?.pending        ?? 0} tone="info"    />
        <Kpi icon="▶️" label="In Progress" value={stats?.inProgress     ?? 0} tone="active"  />
        <Kpi icon="🔴" label="Overdue"     value={stats?.overdue        ?? 0} tone="danger"  />
        <Kpi icon="✅" label="Done Today"  value={stats?.completedToday ?? 0} tone="ok"      />
      </div>

      {/* ══ NEW TASK FORM ════════════════════════════════ */}
      {showForm && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> New Task
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            {/* Title */}
            <input
              ref={titleRef}
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="Task title…"
              required
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />

            {/* Category + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Category</label>
                <select
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Priority</label>
                <select
                  value={fPriority}
                  onChange={(e) => setFPriority(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <textarea
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="Description (optional)…"
              rows={2}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground resize-none focus:border-primary focus:outline-none"
            />

            {/* Due date + Site + Assignee */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Due Date</label>
                <input
                  type="datetime-local"
                  value={fDue}
                  onChange={(e) => setFDue(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Site</label>
                <select
                  value={fSite}
                  onChange={(e) => setFSite(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">— No site —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Assign To</label>
                <select
                  value={fAssignee}
                  onChange={(e) => setFAssignee(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">— Unassigned —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border/60 px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !fTitle.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filter Tabs ────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === tab.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground",
              tab.key === "OVERDUE" && (stats?.overdue ?? 0) > 0 && filter !== "OVERDUE"
                ? "border-red-500/50 text-red-400"
                : ""
            )}
          >
            {tab.label}
            {tab.key === "OVERDUE" && (stats?.overdue ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-400">
                {stats?.overdue}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => { loadTasks(); loadStats(); }}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* ══ TASK LIST ════════════════════════════════════ */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState filter={filter} onNew={() => setShowForm(true)} />
      ) : (
        <div className="space-y-2.5">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              actionId={actionId}
              onStart={()    => updateStatus(task.id, "IN_PROGRESS")}
              onComplete={() => updateStatus(task.id, "COMPLETED")}
              onDelete={()   => deleteTask(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Task Card
// ─────────────────────────────────────────────────────────────

function TaskCard({
  task, actionId, onStart, onComplete, onDelete,
}: {
  task:       Task;
  actionId:   string | null;
  onStart:    () => void;
  onComplete: () => void;
  onDelete:   () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue  = isOverdue(task);
  const done     = task.status === "COMPLETED";
  const loading  = actionId === task.id;
  const cat      = catInfo(task.category);

  return (
    <div className={cn(
      "relative flex overflow-hidden rounded-xl border bg-background/60 backdrop-blur transition-all",
      done    ? "border-border/30 opacity-55"            :
      overdue ? "border-red-500/50 bg-red-500/5"         :
                "border-border/40 hover:border-border/70"
    )}>
      {/* ── Priority strip (left) ─── */}
      <div className={cn("w-1 shrink-0 rounded-l-xl", PRIORITY_STRIP[task.priority] ?? "bg-border")} />

      {/* ── Content ─────────────── */}
      <div className="flex-1 px-4 py-3.5 min-w-0">

        {/* Top row */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-base">{cat.icon}</span>

          <span className={cn(
            "flex-1 min-w-0 font-semibold text-sm leading-snug",
            done && "line-through text-muted-foreground"
          )}>
            {task.title}
          </span>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_BADGE[task.priority])}>
              {task.priority}
            </span>
            <span className="rounded border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {cat.label}
            </span>
            {task.isAutoAssigned && (
              <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                AUTO
              </span>
            )}
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              task.status === "COMPLETED"  ? "bg-green-500/15 text-green-400"  :
              task.status === "IN_PROGRESS"? "bg-primary/15 text-primary"       :
                                             "bg-muted/50 text-muted-foreground"
            )}>
              {task.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {/* Description — collapsible */}
        {task.description && (
          <div className="mt-1.5">
            <p className={cn("text-xs text-muted-foreground", !expanded && "line-clamp-2")}>
              {task.description}
            </p>
            {task.description.length > 120 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 flex items-center gap-0.5 text-[10px] text-primary/70 hover:text-primary"
              >
                {expanded
                  ? <><ChevronUp className="h-3 w-3" />Show less</>
                  : <><ChevronDown className="h-3 w-3" />Show more</>
                }
              </button>
            )}
          </div>
        )}

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {task.assignee && (
            <span className="flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              {task.assignee.name}
            </span>
          )}
          {task.site && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {task.site.code}
            </span>
          )}
          {task.dueDate && (
            <span className={cn("flex items-center gap-1", overdue && "text-red-400 font-medium")}>
              <Clock className="h-3 w-3" />
              {overdue ? "Overdue · " : "Due · "}
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.completedAt && (
            <span className="flex items-center gap-1 text-green-400/70">
              <Check className="h-3 w-3" />
              Done · {formatDate(task.completedAt)}
            </span>
          )}
          {overdue && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
        </div>
      </div>

      {/* ── Action buttons (right) ─ */}
      {!done && (
        <div className="flex flex-col justify-center gap-1.5 px-3 py-3 border-l border-border/30">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
          ) : (
            <>
              {task.status === "PENDING" && (
                <button
                  onClick={onStart}
                  title="Start task"
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors"
                >
                  <Play className="h-3 w-3" /> Start
                </button>
              )}
              <button
                onClick={onComplete}
                title="Mark complete"
                className="flex items-center gap-1 rounded-lg border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-500/20 transition-colors"
              >
                <Check className="h-3 w-3" /> Done
              </button>
              <button
                onClick={onDelete}
                title="Delete task"
                className="rounded-lg border border-border/40 p-1.5 text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Completed — just show delete */}
      {done && (
        <div className="flex flex-col justify-center px-3 py-3 border-l border-border/30">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : (
              <button
                onClick={onDelete}
                className="rounded-lg border border-border/40 p-1.5 text-muted-foreground/50 hover:border-red-500/40 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )
          }
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────

type KpiTone = "neutral" | "info" | "active" | "danger" | "ok";

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: KpiTone }) {
  const border: Record<KpiTone, string> = {
    neutral: "border-border/40",
    info:    "border-primary/30  bg-primary/5",
    active:  "border-primary/40  bg-primary/8",
    danger:  value > 0 ? "border-red-500/40 bg-red-500/5"   : "border-border/40",
    ok:      value > 0 ? "border-green-500/30 bg-green-500/5" : "border-border/40",
  };
  const text: Record<KpiTone, string> = {
    neutral: "text-foreground",
    info:    "text-primary",
    active:  "text-primary",
    danger:  value > 0 ? "text-red-400"   : "text-muted-foreground",
    ok:      value > 0 ? "text-green-400" : "text-muted-foreground",
  };
  return (
    <div className={cn("rounded-xl border p-4", border[tone])}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className={cn("mt-1.5 font-display text-2xl tabular-nums", text[tone])}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────

const EMPTY_MSG: Record<FilterKey, { icon: string; title: string; sub: string }> = {
  ALL:         { icon: "✅", title: "No tasks yet",           sub: "Create your first task or wait for auto-generated items from sensor alerts." },
  MINE:        { icon: "👤", title: "Nothing assigned to you", sub: "Tasks assigned to you will appear here."                                     },
  PENDING:     { icon: "⏳", title: "No pending tasks",        sub: "All caught up! No tasks are waiting to start."                               },
  IN_PROGRESS: { icon: "▶️", title: "Nothing in progress",     sub: "Start a pending task to see it here."                                        },
  OVERDUE:     { icon: "🎉", title: "No overdue tasks",        sub: "Great work — everything is on schedule."                                     },
  COMPLETED:   { icon: "📋", title: "No completed tasks",      sub: "Completed tasks will appear here."                                           },
};

function EmptyState({ filter, onNew }: { filter: FilterKey; onNew: () => void }) {
  const msg = EMPTY_MSG[filter];
  return (
    <div className="rounded-2xl border border-dashed border-border/50 bg-muted/5 py-16 text-center space-y-3 px-6">
      <div className="text-4xl">{msg.icon}</div>
      <div className="font-semibold text-foreground">{msg.title}</div>
      <div className="text-sm text-muted-foreground max-w-sm mx-auto">{msg.sub}</div>
      {filter === "ALL" && (
        <button
          onClick={onNew}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New Task
        </button>
      )}
    </div>
  );
}
