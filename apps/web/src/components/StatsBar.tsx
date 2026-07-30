import { motion } from 'framer-motion';
import { formatBytes } from '../lib/format';
import type { DocumentRecord } from '../types';

interface StatsBarProps {
  documents: DocumentRecord[];
}

export function StatsBar({ documents }: StatsBarProps) {
  const totalChunks = documents.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0);
  const totalStorage = documents.reduce((sum, d) => sum + d.sizeBytes, 0);

  const stats = [
    { label: 'Documents', value: documents.length.toLocaleString() },
    { label: 'Chunks indexed', value: totalChunks.toLocaleString() },
    { label: 'Storage used', value: formatBytes(totalStorage) },
  ];

  return (
    <div className="stats-bar">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          className="stat-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 * i }}
        >
          <span className="stat-value">{stat.value}</span>
          <span className="stat-label">{stat.label}</span>
        </motion.div>
      ))}
    </div>
  );
}
