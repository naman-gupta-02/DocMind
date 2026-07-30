import { motion } from 'framer-motion';
import { Brain, ChevronRight, Database, FileSearch, Scissors, Sparkles, Upload } from 'lucide-react';

const STEPS = [
  { icon: Upload, label: 'Upload', color: '#3b82f6' },
  { icon: FileSearch, label: 'Parse', color: '#f59e0b' },
  { icon: Scissors, label: 'Chunk', color: '#ec4899' },
  { icon: Brain, label: 'Embed', color: '#8b5cf6' },
  { icon: Database, label: 'Index', color: '#22d3ee' },
];

export function Hero() {
  return (
    <div className="hero">
      <motion.h1
        className="hero-logo"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Sparkles size={30} strokeWidth={2.5} />
        DocMind
      </motion.h1>
      <motion.p
        className="hero-tagline"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        Upload a document and watch it move through a real retrieval-augmented-generation
        ingestion pipeline — parsed, chunked, embedded, and indexed in real time.
      </motion.p>

      <motion.div
        className="pipeline-explainer"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {STEPS.map((step, i) => (
          <span key={step.label} style={{ display: 'contents' }}>
            <div className="pipeline-step">
              <div
                className="pipeline-step-icon"
                style={{ background: `${step.color}26`, color: step.color }}
              >
                <step.icon size={18} />
              </div>
              <span className="pipeline-step-label">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight size={16} className="pipeline-arrow" />}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
