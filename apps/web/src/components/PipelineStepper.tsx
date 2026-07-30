import { AlertTriangle, Brain, CheckCheck, Database, FileSearch, Scissors } from 'lucide-react';
import type { DocumentStatus } from '../types';

const NODES: Array<{ stage: DocumentStatus; icon: typeof FileSearch }> = [
  { stage: 'parsing', icon: FileSearch },
  { stage: 'chunking', icon: Scissors },
  { stage: 'embedding', icon: Brain },
  { stage: 'indexing', icon: Database },
];

interface PipelineStepperProps {
  stage: DocumentStatus;
  message: string;
}

export function PipelineStepper({ stage, message }: PipelineStepperProps) {
  if (stage === 'failed') {
    return (
      <div>
        <div className="stepper">
          {NODES.map((node, i) => (
            <span key={node.stage} style={{ display: 'contents' }}>
              <div className="stepper-node stepper-node--failed">
                <node.icon size={13} />
              </div>
              {i < NODES.length - 1 && <div className="stepper-line" />}
            </span>
          ))}
        </div>
        <div className="stepper-caption stepper-caption--failed">
          <AlertTriangle size={13} />
          {message}
        </div>
      </div>
    );
  }

  const completed = stage === 'completed';
  const currentIndex = completed ? NODES.length : NODES.findIndex((n) => n.stage === stage);

  return (
    <div>
      <div className="stepper">
        {NODES.map((node, i) => {
          const isDone = completed || i < currentIndex;
          const isActive = !completed && i === currentIndex;
          return (
            <span key={node.stage} style={{ display: 'contents' }}>
              <div
                className={`stepper-node${isDone ? ' stepper-node--done' : ''}${isActive ? ' stepper-node--active' : ''}`}
              >
                {isDone ? <CheckCheck size={13} /> : <node.icon size={13} />}
              </div>
              {i < NODES.length - 1 && (
                <div className="stepper-line">
                  <div
                    className="stepper-line-fill"
                    style={{ transform: `scaleX(${i < currentIndex ? 1 : 0})` }}
                  />
                </div>
              )}
            </span>
          );
        })}
      </div>
      <div className={`stepper-caption${completed ? ' stepper-caption--done' : ''}`}>
        {completed && <CheckCheck size={13} />}
        {message}
      </div>
    </div>
  );
}
