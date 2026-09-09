import React, { useEffect, useState } from 'react';
import { FileText, Download, X } from 'lucide-react';

interface PdfPreviewModalProps {
  blob: Blob;
  filename: string;
  onClose: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ blob, filename, onClose }) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl h-[100dvh] sm:h-[85vh] max-h-[95dvh] sm:max-h-none flex flex-col overflow-hidden rounded-2xl glass-panel border border-slate-200/80 dark:border-slate-800/80 shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-rose-500 to-sky-500 p-0.5 shrink-0">
              <div className="w-full h-full bg-slate-900 dark:bg-slate-950 rounded-[9px] flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  Reporte Meteorológico
                </h3>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 rounded-md shrink-0">
                  PDF
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{filename}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              download={filename}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar</span>
            </a>
            <button
              onClick={onClose}
              title="Cerrar (Esc)"
              className="p-2 rounded-xl bg-white/90 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 shadow-sm transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: visor del PDF embebido */}
        <div className="flex-1 min-h-0 bg-white overflow-hidden">
          {url && (
            <iframe
              src={url}
              title="Vista previa del reporte meteorológico"
              className="w-full h-full block"
            />
          )}
        </div>
      </div>
    </div>
  );
};