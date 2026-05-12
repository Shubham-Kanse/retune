"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  TRANSITION_PULSE_MS,
  TRANSITION_BLOOM_MS,
  TRANSITION_STAGGER_MS,
  TRANSITION_REDUCED_MS,
  useReducedMotion,
} from "@/lib/onboarding/transition";

interface BloomTransitionProps {
  showChat: boolean;
  introContent: React.ReactNode;
  chatContent: React.ReactNode;
}

export function BloomTransition({ showChat, introContent, chatContent }: BloomTransitionProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <AnimatePresence mode="wait">
        {!showChat ? (
          <motion.div
            key="intro"
            className="contents"
            exit={{ opacity: 0 }}
            transition={{ duration: TRANSITION_REDUCED_MS / 1000 }}
          >
            {introContent}
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            className="contents"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: TRANSITION_REDUCED_MS / 1000 }}
          >
            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const pulseSec = TRANSITION_PULSE_MS / 1000;
  const bloomDelay = pulseSec * 0.75;

  return (
    <>
      {/* Intro — exits with scale+fade */}
      <AnimatePresence>
        {!showChat && (
          <motion.div
            key="intro"
            className="absolute inset-0"
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: pulseSec, ease: [0.4, 0, 0.2, 1] }}
          >
            {introContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Radial pulse — blooms from center as intro exits */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            key="pulse"
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: pulseSec, ease: "easeOut", times: [0, 0.3, 1] }}
          >
            <motion.div
              className="rounded-full"
              style={{
                width: 80,
                height: 80,
                background: "radial-gradient(circle, oklch(60% 0.16 155 / 0.25) 0%, transparent 70%)",
              }}
              initial={{ scale: 1 }}
              animate={{ scale: 3.5 }}
              transition={{ duration: pulseSec, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat blooms in */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            key="chat"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: bloomDelay, duration: TRANSITION_BLOOM_MS / 1000, ease: "easeOut" }}
          >
            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── BloomItem — staggered entry for individual chat elements ─────────────────

interface BloomItemProps {
  index: number;
  children: React.ReactNode;
  className?: string;
}

export function BloomItem({ index, children, className }: BloomItemProps) {
  const reduced = useReducedMotion();
  const delay = reduced
    ? 0
    : (TRANSITION_PULSE_MS / 1000) * 0.75 + (index * TRANSITION_STAGGER_MS) / 1000;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: TRANSITION_BLOOM_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
