import type { ComponentType } from 'react';
import { CloudSun, Boxes, FolderKanban, AppWindow, ServerCog } from 'lucide-react';

export const PORTAL_ACTIVE_KEY = 'portal_last_project';

export type ProjectStatus = 'active' | 'upcoming';

export interface PortalProject {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  status: ProjectStatus;
  badge?: string;
  url?: string;
}

export const projects: PortalProject[] = [
  {
    id: 'meteoperu',
    title: 'MeteoPerú Pro',
    description:
      'Monitoreo del clima en tiempo real para el Perú: pronósticos por hora, mapa de regiones, alertas, análisis histórico y reportes oficiales en PDF.',
    icon: CloudSun,
    gradient: 'from-red-600 via-rose-500 to-sky-500',
    status: 'active',
    badge: 'PRO',
  },
  {
    id: 'proyecto-01',
    title: 'Proyecto 01',
    description:
      'Nuevo módulo institucional en etapa de planificación. Se habilitará próximamente.',
    icon: Boxes,
    gradient: 'from-emerald-600 via-teal-500 to-cyan-500',
    status: 'upcoming',
  },
  {
    id: 'cloudops',
    title: 'CloudOps Dashboard',
    description:
      'Simulador académico de arquitectura AWS: planificación de soluciones, calculadora de costos, regiones globales, seguridad y topología de red VPC.',
    icon: ServerCog,
    gradient: 'from-sky-600 via-blue-500 to-indigo-500',
    status: 'active',
    badge: 'AWS',
    url: 'https://cloudops-dashboard-yomar.vercel.app',
  },
  {
    id: 'proyecto-03',
    title: 'Proyecto 03',
    description:
      'Nuevo módulo institucional en etapa de planificación. Se habilitará próximamente.',
    icon: AppWindow,
    gradient: 'from-amber-600 via-orange-500 to-rose-500',
    status: 'upcoming',
  },
];