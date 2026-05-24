"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaHome,
  FaList,
  FaRedo,
} from "react-icons/fa";

import { getJsonItemWithExpiry, STORAGE_KEYS } from "@/lib/local-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpdateStats {
  totalUpdated: number;
  errorCount: number;
  timeTaken: number;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  delay = 0,
}: Readonly<{
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: string;
  color: string;
  delay?: number;
}>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-2 rounded-2xl p-5"
      style={{
        backgroundColor: "var(--z-card-up)",
        border: "1px solid var(--z-border)",
      }}
    >
      <div
        className="flex size-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: `${color}18`,
          border: `1px solid ${color}40`,
        }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <p
        className="text-2xl font-black tabular-nums"
        style={{ color: "var(--z-text)", fontFamily: "var(--font-syne)" }}
      >
        {value}
      </p>
      <p
        className="text-center text-xs font-medium"
        style={{ color: "var(--z-muted)" }}
      >
        {label}
      </p>
    </motion.div>
  );
}

// ─── Particle component ───────────────────────────────────────────────────────

function Particle({
  x,
  y,
  color,
  delay,
  size,
}: Readonly<{
  x: string;
  y: string;
  color: string;
  delay: number;
  size: number;
}>) {
  return (
    <motion.div
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        backgroundColor: color,
      }}
      initial={{ opacity: 0, scale: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, 1, 0.5],
        y: [-20, -80],
        x: [0, Math.random() > 0.5 ? 30 : -30],
      }}
      transition={{
        delay,
        duration: 1.4,
        ease: "easeOut",
      }}
    />
  );
}

// ─── Particles burst ──────────────────────────────────────────────────────────

const PARTICLES = [
  {
    id: "p1",
    x: "48%",
    y: "42%",
    color: "var(--z-amber)",
    delay: 0.2,
    size: 6,
  },
  { id: "p2", x: "52%", y: "40%", color: "var(--z-pink)", delay: 0.3, size: 5 },
  {
    id: "p3",
    x: "45%",
    y: "44%",
    color: "var(--z-frost)",
    delay: 0.25,
    size: 4,
  },
  {
    id: "p4",
    x: "55%",
    y: "43%",
    color: "var(--z-amber)",
    delay: 0.35,
    size: 5,
  },
  {
    id: "p5",
    x: "50%",
    y: "38%",
    color: "var(--z-green)",
    delay: 0.15,
    size: 7,
  },
  { id: "p6", x: "43%", y: "41%", color: "var(--z-pink)", delay: 0.4, size: 4 },
  {
    id: "p7",
    x: "57%",
    y: "41%",
    color: "var(--z-frost)",
    delay: 0.28,
    size: 6,
  },
  {
    id: "p8",
    x: "46%",
    y: "39%",
    color: "var(--z-amber)",
    delay: 0.18,
    size: 5,
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CompletedPage() {
  const router = useRouter();
  const [stats, setStats] = useState<UpdateStats | null>(null);
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    setStats(
      getJsonItemWithExpiry<UpdateStats>(STORAGE_KEYS.updateStats, {
        totalUpdated: 0,
        errorCount: 0,
        timeTaken: 0,
      }),
    );

    // Trigger particle burst after checkmark appears
    const t = setTimeout(() => setShowParticles(true), 500);
    return () => clearTimeout(t);
  }, []);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  return (
    <div
      className="
        relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12
      "
      style={{ backgroundColor: "var(--z-bg)" }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(245,166,35,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Particles */}
      <AnimatePresence>
        {showParticles && PARTICLES.map((p) => <Particle key={p.id} {...p} />)}
      </AnimatePresence>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        {/* ── Animated checkmark ────────────────────────────────────────── */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 18,
            delay: 0.1,
          }}
          className="relative mb-6"
        >
          {/* Outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0.6, 1.6, 2] }}
            transition={{ delay: 0.4, duration: 1.2, ease: "easeOut" }}
            style={{
              backgroundColor: "transparent",
              border: "2px solid rgba(34,197,94,0.5)",
            }}
          />

          {/* Main circle */}
          <div
            className="relative flex size-24 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(34,197,94,0.1)",
              border: "2px solid rgba(34,197,94,0.45)",
              boxShadow:
                "0 0 0 8px rgba(34,197,94,0.05), 0 0 60px rgba(34,197,94,0.2)",
            }}
          >
            <FaCheckCircle size={44} style={{ color: "var(--z-green)" }} />
          </div>
        </motion.div>

        {/* ── Heading ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mb-2 text-center"
        >
          <h1
            className="text-4xl font-black tracking-tight"
            style={{
              fontFamily: "var(--font-syne)",
              color: "var(--z-text)",
            }}
          >
            Update Complete!
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--z-muted)" }}>
            Your AniList custom lists have been synced.
          </p>
        </motion.div>

        {/* ── Stats grid ────────────────────────────────────────────────── */}
        {stats && (
          <div className="mt-8 grid w-full grid-cols-3 gap-3">
            <StatCard
              icon={FaList}
              label="Entries Updated"
              value={String(stats.totalUpdated)}
              color="var(--z-amber)"
              delay={0.5}
            />
            <StatCard
              icon={FaExclamationTriangle}
              label="Errors"
              value={String(stats.errorCount)}
              color={stats.errorCount > 0 ? "var(--z-red)" : "var(--z-muted)"}
              delay={0.6}
            />
            <StatCard
              icon={FaClock}
              label="Time Taken"
              value={formatTime(stats.timeTaken)}
              color="var(--z-frost)"
              delay={0.7}
            />
          </div>
        )}

        {/* ── Nothing updated notice ─────────────────────────────────────── */}
        {stats?.totalUpdated === 0 && stats.errorCount === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-4 text-center text-sm"
            style={{ color: "var(--z-muted)" }}
          >
            No entries needed updating — your lists were already in sync.
          </motion.p>
        )}

        {/* ── Action buttons ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.4 }}
          className="mt-9 flex w-full flex-col gap-3 sm:flex-row"
        >
          <button
            onClick={() => router.push("/")}
            className="
              flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-sm
              font-semibold transition-all
              hover:bg-z-card-up
              active:scale-[0.97]
            "
            style={{
              border: "1px solid var(--z-border-mid)",
              color: "var(--z-muted)",
            }}
          >
            <FaHome size={13} />
            Return Home
          </button>

          <button
            onClick={() => router.push("/custom-list-manager")}
            className="
              flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-sm
              font-bold transition-all
              hover:brightness-110
              active:scale-[0.97]
            "
            style={{
              background:
                "linear-gradient(135deg, var(--z-amber) 0%, #e8952a 100%)",
              color: "#07060f",
            }}
          >
            <FaRedo size={11} />
            Manage Lists Again
          </button>
        </motion.div>

        {/* ── Footer note ───────────────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-8 text-center text-xs"
          style={{ color: "var(--z-subtle)" }}
        >
          Changes are reflected on AniList immediately.
        </motion.p>
      </div>
    </div>
  );
}
