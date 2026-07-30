import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import { Loader2, UploadCloud } from 'lucide-react';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

const ACCEPTED = '.pdf,.docx,.txt,.md';

export function UploadDropzone({ onFileSelected, disabled }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFileSelected(file);
  }

  return (
    <motion.div
      className={`dropzone${isDragOver ? ' dropzone--active' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      whileHover={disabled ? undefined : { scale: 1.005 }}
      whileTap={disabled ? undefined : { scale: 0.995 }}
    >
      <div className="dropzone-icon-wrap">
        {disabled ? <Loader2 size={26} className="dropzone-spinner" /> : <UploadCloud size={26} />}
      </div>
      <span className="dropzone-title">
        {disabled ? 'Uploading…' : 'Drag & drop a file here, or click to browse'}
      </span>
      <span className="dropzone-sub">Supports PDF, DOCX, TXT, and Markdown</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        hidden
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = '';
        }}
      />
    </motion.div>
  );
}
