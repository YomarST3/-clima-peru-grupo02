import React, { useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { PortalProject } from '../data/projects';

interface ExternalProjectViewProps {
  project: PortalProject;
  onBack: () => void;
}

export const ExternalProjectView: React.FC<ExternalProjectViewProps> = ({
  project,
  onBack,
}) => {
  const [loaded, setLoaded] = useState(false);
  const Icon = project.icon;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/10 bg-slate-900/80">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Volver al portal</span>
            <span className="sm:hidden">Volver</span>
          </button>
          <span className="w-9 h-9 rounded-xl bg-gradient-to-tr to-sky-500 p-0.5 shrink-0">
            <span className={`w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center bg-gradient-to-tr ${project.gradient}`}>
              <Icon className="w-4 h-4 text-white" />
            </span>
          </span>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold truncate">{project.title}</h1>
            {project.badge && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 rounded-md">
                {project.badge}
              </span>
            )}
          </div>
        </div>
        {project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-colors shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Abrir en pestaña nueva</span>
          </a>
        )}
      </header>

      <main className="flex-1 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            Cargando {project.title}…
          </div>
        )}
        {project.url && (
          <iframe
            title={project.title}
            src={project.url}
            onLoad={() => setLoaded(true)}
            className={`w-full h-full border-0 transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </main>
    </div>
  );
};