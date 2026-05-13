"use client";

import { AnimatePresence, motion } from "motion/react";

interface BloomTransitionProps {
  showChat: boolean;
  introContent: React.ReactNode;
  chatContent: React.ReactNode;
}

export function BloomTransition({ showChat, introContent, chatContent }: BloomTransitionProps) {
  return (
    <div className="relative h-full">
      <AnimatePresence>
        {!showChat && (
          <motion.div
            key="intro"
            className="absolute inset-0"
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.3 }}
          >
            {introContent}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showChat && (
          <motion.div
            key="chat"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
