import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Thermometer, CloudRain, Sun, MapPin, Eye, Flame, Radio } from 'lucide-react';
import { DepartmentWeatherSummary, City } from '../types/weather';
import peruGeoJson from '../assets/peru_departamentos.json';

interface PeruMapProps {
  departmentsSummary: DepartmentWeatherSummary[];
  onSelectCityByName: (cityName: string) => void;
  selectedCity: City | null;
  theme?: 'dark' | 'light';
}

// Normalizador para cruzar nombres de departamentos con o sin tildes/espacios
const normalizeName = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

export const PeruMap: React.FC<PeruMapProps> = ({
  departmentsSummary,
  onSelectCityByName,
  selectedCity,
  theme = 'dark'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [metric, setMetric] = useState<'temperature' | 'precipitation' | 'uv_index'>('temperature');
  const [hoveredDept, setHoveredDept] = useState<DepartmentWeatherSummary | null>(null);
  const [showRadar, setShowRadar] = useState<boolean>(true);

  // Busca el registro departamental por nombre normalizado
  const getDepartmentData = (rawName: string): DepartmentWeatherSummary | undefined => {
    if (!rawName) return undefined;
    const norm = normalizeName(rawName);
    return departmentsSummary.find((d) => normalizeName(d.department_name) === norm);
  };

  // Escala y gradiente térmico continuo estilo SENAMHI Multianual
  const getColorByValue = (val: number | undefined | null, type: 'temperature' | 'precipitation' | 'uv_index'): string => {
    if (val === undefined || val === null) return '#334155';

    if (type === 'temperature') {
      // Escala oficial térmica SENAMHI (7 niveles basados en el mapa multianual):
      // < 6°C: Azul marino profundo / heladas de sierra alta (Puno, Pasco)
      if (val < 6) return '#172554';
      // 6°C a 10°C: Azul andino / helada moderada (Junín, Huancavelica)
      if (val <= 10) return '#2563eb';
      // 11°C a 14°C: Cian / frío de altura (Cusco, Ayacucho)
      if (val <= 14) return '#06b6d4';
      // 15°C a 18°C: Verde esmeralda / templado valles (Cajamarca, Arequipa)
      if (val <= 18) return '#10b981';
      // 19°C a 22°C: Amarillo dorado / costa templada (Lima, Áncash, Ica)
      if (val <= 22) return '#eab308';
      // 23°C a 26°C: Naranja cálido (La Libertad, Lambayeque)
      if (val <= 26) return '#f97316';
      // > 26°C: Rojo fuego / calor selva baja y norte extremo (Piura, Loreto, Ucayali, Tumbes)
      return '#dc2626';
    } else if (type === 'precipitation') {
      if (val === 0) return '#334155'; // Seco
      if (val <= 2) return '#38bdf8'; // Ligera
      if (val <= 8) return '#2563eb'; // Moderada
      return '#7c3aed'; // Torrencial
    } else {
      // uv_index
      if (val < 3) return '#10b981'; // Bajo
      if (val < 6) return '#eab308'; // Moderado
      if (val < 8) return '#f97316'; // Alto
      if (val < 11) return '#ef4444'; // Muy Alto
      return '#a855f7'; // Extremo
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Centered on Peru coordinates [-9.19, -75.01]
      const map = L.map(mapContainerRef.current, {
        center: [-9.189967, -75.015152],
        zoom: 5.5,
        minZoom: 4,
        maxZoom: 10,
        zoomControl: false,
        attributionControl: false
      });

      const tileUrl = theme === 'light'
        ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 16,
        subdomains: 'abc'
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      markersLayerRef.current = markersGroup;
    }

    return () => {
      if (geoJsonLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(geoJsonLayerRef.current);
        geoJsonLayerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // Update Tile Layer when theme changes
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const tileUrl = theme === 'light'
      ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

    tileLayerRef.current.setUrl(tileUrl);
  }, [theme]);

  // Update Choropleth Polygons (SENAMHI style) and Markers when data or metric changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    // 1. Limpiar capa GeoJSON previa si existe
    if (geoJsonLayerRef.current) {
      mapInstanceRef.current.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    // 2. Capa GeoJSON Coroplética / Térmica de Cobertura Total (Nivel Medio)
    const geoJsonLayer = L.geoJSON(peruGeoJson as any, {
      style: (feature: any) => {
        const depName = feature?.properties?.NOMBDEP || feature?.properties?.name;
        const deptData = getDepartmentData(depName);
        const val = deptData ? deptData[metric] : null;
        const color = getColorByValue(val, metric);
        const isSelected =
          selectedCity &&
          deptData &&
          (selectedCity.name === deptData.capital || selectedCity.department_name === deptData.department_name);

        return {
          fillColor: color,
          weight: isSelected ? 2.5 : 1.2,
          opacity: 0.9,
          color: isSelected ? '#38bdf8' : (theme === 'light' ? '#cbd5e1' : '#0f172a'),
          fillOpacity: isSelected ? 0.88 : 0.72,
        };
      },
      onEachFeature: (feature: any, layer: L.Path) => {
        const depName = feature?.properties?.NOMBDEP || feature?.properties?.name;
        const deptData = getDepartmentData(depName);

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({
              weight: 2.5,
              color: '#38bdf8',
              fillOpacity: 0.88,
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
              l.bringToFront();
            }
            if (deptData) setHoveredDept(deptData);
          },
          mouseout: (e) => {
            if (geoJsonLayerRef.current) {
              geoJsonLayerRef.current.resetStyle(e.target);
            }
          },
          click: () => {
            if (deptData) {
              setHoveredDept(deptData);
              onSelectCityByName(deptData.capital);
            }
          },
        });
      },
    }).addTo(mapInstanceRef.current);

    geoJsonLayerRef.current = geoJsonLayer;

    // 3. Marcadores Flotantes con Ondas Radar Expansivas y Puntos de Máximo Calor (Nivel Superior)
    markersLayerRef.current.clearLayers();

    // Determinar temperatura máxima para identificar los puntos de mayor calor
    const maxTemp = departmentsSummary.reduce((max, d) => Math.max(max, d.temperature || 0), 0);

    departmentsSummary.forEach((dept) => {
      const val = dept[metric];
      const color = getColorByValue(val, metric);
      const isSelected = selectedCity?.name === dept.capital || selectedCity?.department_name === dept.department_name;

      // Puntos de mayor calor: temperatura >= 24°C o en el rango máximo (estilo Piura, Loreto, Ucayali, Tumbes)
      const isHotSpot = metric === 'temperature' && (dept.temperature >= 24 || (dept.temperature >= maxTemp - 2 && dept.temperature >= 22));

      const label = metric === 'temperature' ? `${dept.temperature}°` : metric === 'precipitation' ? `${dept.precipitation}mm` : `UV ${dept.uv_index}`;

      let markerHtml = '';
      let iconSize: [number, number] = [40, 40];
      let iconAnchor: [number, number] = [20, 20];

      if (isHotSpot) {
        // Icono Pin Rojo Oficial (Imagen 2) con anillo en el suelo y olas térmicas expansivas
        iconSize = [70, 70];
        iconAnchor = [35, 52];
        markerHtml = `
          <div class="hot-spot-container" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 70px; height: 70px; cursor: pointer;">
            <!-- Olas térmicas continuas expansivas (Heat waves en GPU) -->
            <div class="heat-wave-container">
              <div class="heat-wave-ring" style="background: radial-gradient(circle, rgba(220,38,38,0.55) 0%, rgba(249,115,22,0.2) 60%, transparent 80%); border: 1.5px solid rgba(220,38,38,0.85);"></div>
              <div class="heat-wave-ring" style="background: radial-gradient(circle, rgba(239,68,68,0.45) 0%, rgba(249,115,22,0.15) 60%, transparent 80%); border: 1.5px solid rgba(239,68,68,0.7);"></div>
              <div class="heat-wave-ring" style="background: radial-gradient(circle, rgba(249,115,22,0.3) 0%, transparent 70%); border: 1px solid rgba(249,115,22,0.55);"></div>
            </div>

            <!-- Pin Rojo Oficial de la Imagen 2 con relieve y sombra -->
            <div class="hot-spot-pin-wrapper" style="position: relative; z-index: 10; transform: ${isSelected ? 'scale(1.28)' : 'scale(1)'}; transition: transform 0.2s ease;">
              <svg viewBox="0 0 40 52" width="32" height="42" style="overflow: visible; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6));">
                <!-- Anillo elíptico en el suelo (Base ground marker de la Imagen 2) -->
                <ellipse cx="20" cy="48" rx="14" ry="4" fill="none" stroke="#dc2626" stroke-width="2.5" />
                <!-- Sombra proyectada del pin -->
                <path d="M 20,4 C 11,4 4,11.5 4,20.5 C 4,29 17.5,43 20,45.5 C 22.5,43 36,29 36,20.5 C 36,11.5 29,4 20,4 Z" fill="#7f1d1d" opacity="0.3" transform="translate(1, 2)" />
                <!-- Cuerpo del Pin en rojo vivo -->
                <path d="M 20,4 C 11,4 4,11.5 4,20.5 C 4,29 17.5,43 20,45.5 C 22.5,43 36,29 36,20.5 C 36,11.5 29,4 20,4 Z" fill="#dc2626" />
                <!-- Gradiente de relieve 3D idéntico a imagen 2 -->
                <path d="M 20,4 C 11,4 4,11.5 4,20.5 C 4,29 17.5,43 20,45.5 C 22.5,43 36,29 36,20.5 C 36,11.5 29,4 20,4 Z" fill="url(#hotPinGrad-${dept.department_id})" />
                <!-- Círculo interior blanco cortado (Imagen 2) -->
                <circle cx="20" cy="18.5" r="6.2" fill="#ffffff" />
                <defs>
                  <linearGradient id="hotPinGrad-${dept.department_id}" x1="0.1" y1="0" x2="0.9" y2="1">
                    <stop offset="0%" stop-color="#ff3b5c" />
                    <stop offset="65%" stop-color="#dc2626" />
                    <stop offset="100%" stop-color="#991b1b" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <!-- Nombre de Departamento Visible y Estilizado (Sin tapar el mapa) -->
            <div style="
              position: absolute;
              top: -14px;
              left: 50%;
              transform: translateX(-50%);
              display: flex;
              align-items: center;
              gap: 3px;
              white-space: nowrap;
              pointer-events: none;
              z-index: 25;
            ">
              <span style="
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                color: #ffffff;
                text-shadow: 0 1px 3px #000, 0 -1px 3px #000, 1px 0 3px #000, -1px 0 3px #000, 0 2px 6px rgba(0,0,0,0.95);
              ">${dept.department_name}</span>
              <span style="
                font-size: 9.5px;
                font-weight: 800;
                padding: 0.5px 4px;
                border-radius: 4px;
                background: #dc2626;
                color: #ffffff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.5);
                border: 1px solid rgba(255,255,255,0.4);
              ">${label}</span>
            </div>
          </div>
        `;
      } else {
        // Marcador meteorológico elegante y minimalista para las demás regiones
        iconSize = [44, 44];
        iconAnchor = [22, 22];
        markerHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 44px; height: 44px; cursor: pointer;">
            <!-- Olas térmicas continuas del color correspondiente -->
            <div class="heat-wave-container">
              <div class="heat-wave-ring" style="background: radial-gradient(circle, ${color}50 0%, transparent 70%); border: 1px solid ${color}80;"></div>
              <div class="heat-wave-ring" style="background: radial-gradient(circle, ${color}35 0%, transparent 70%); border: 1px solid ${color}55;"></div>
            </div>

            <!-- Baliza luminosa central -->
            <div style="
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: ${color};
              border: 2px solid ${theme === 'light' ? '#fff' : '#0f172a'};
              box-shadow: 0 0 10px ${color}, 0 2px 4px rgba(0,0,0,0.6);
              position: relative;
              z-index: 10;
              transform: ${isSelected ? 'scale(1.4)' : 'scale(1)'};
              transition: transform 0.2s ease;
            "></div>

            <!-- Nombre de Departamento Visible y Estilizado (Sin tapar el mapa) -->
            <div style="
              position: absolute;
              bottom: 24px;
              left: 50%;
              transform: translateX(-50%);
              display: flex;
              align-items: center;
              gap: 3px;
              white-space: nowrap;
              pointer-events: none;
              z-index: 25;
            ">
              <span style="
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                font-size: 10.5px;
                font-weight: 800;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: #ffffff;
                text-shadow: 0 1px 3px #000, 0 -1px 3px #000, 1px 0 3px #000, -1px 0 3px #000, 0 2px 6px rgba(0,0,0,0.95);
              ">${dept.department_name}</span>
              <span style="
                font-size: 9.5px;
                font-weight: 800;
                color: ${color};
                text-shadow: 0 1px 2px #000, 0 0 4px #000;
              ">${label}</span>
            </div>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        className: 'custom-map-marker',
        html: markerHtml,
        iconSize: iconSize,
        iconAnchor: iconAnchor
      });

      const marker = L.marker([dept.latitude, dept.longitude], { icon: customIcon });

      const popupContent = `
        <div style="padding: 6px 2px; min-width: 180px; color: ${theme === 'light' ? '#0f172a' : '#f8fafc'};">
          <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid ${theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}; padding-bottom: 4px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              ${isHotSpot ? '<span style="font-size: 14px;">🔥</span>' : ''}
              <strong style="font-size: 14px; color: ${theme === 'light' ? '#0284c7' : '#38bdf8'};">${dept.department_name}</strong>
            </div>
            <span style="font-size: 10px; color: ${theme === 'light' ? '#64748b' : '#94a3b8'};">${dept.region_natural}</span>
          </div>
          <div style="font-size: 12px; margin-bottom: 4px;"><strong>Capital:</strong> ${dept.capital}</div>
          <div style="font-size: 12px; margin-bottom: 4px;"><strong>Clima:</strong> ${dept.weather_description}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; margin-top: 8px; background: ${theme === 'light' ? 'rgba(241,245,249,0.9)' : 'rgba(30,41,59,0.5)'}; padding: 6px; border-radius: 8px;">
            <div>🌡️ Temp: <strong>${dept.temperature}°C</strong></div>
            <div>💧 Hum: <strong>${dept.relative_humidity}%</strong></div>
            <div>🌧️ Lluvia: <strong>${dept.precipitation} mm</strong></div>
            <div>☀️ UV: <strong>${dept.uv_index}</strong></div>
          </div>
          <button id="btn-select-${dept.department_id}" style="
            width: 100%;
            margin-top: 10px;
            padding: 6px 12px;
            background: #0284c7;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
          ">
            Ver Pronóstico de ${dept.capital}
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-select-${dept.department_id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectCityByName(dept.capital);
          };
        }
      });

      marker.on('mouseover', () => {
        setHoveredDept(dept);
      });

      marker.on('click', () => {
        setHoveredDept(dept);
      });

      if (markersLayerRef.current) {
        marker.addTo(markersLayerRef.current);
      }
    });
  }, [departmentsSummary, metric, selectedCity, onSelectCityByName, theme]);

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-500 dark:text-sky-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Mapa Térmico Departamental del Perú (SENAMHI)
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cobertura total del territorio nacional según condiciones climáticas en tiempo real.
          </p>
        </div>

        {/* Metric Layer Selectors */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto shadow-sm">
          <button
            onClick={() => setMetric('temperature')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              metric === 'temperature'
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>Temperatura</span>
          </button>

          <button
            onClick={() => setMetric('precipitation')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              metric === 'precipitation'
                ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/40 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span>Lluvia</span>
          </button>

          <button
            onClick={() => setMetric('uv_index')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              metric === 'uv_index'
                ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Índice UV</span>
          </button>

          {/* Radar Doppler Animation Toggle */}
          <button
            onClick={() => setShowRadar(!showRadar)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              showRadar
                ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            title="Alternar animación de radar meteorológico"
          >
            <Radio className={`w-3.5 h-3.5 ${showRadar ? 'animate-pulse text-sky-500' : ''}`} />
            <span>Radar {showRadar ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Map Container & Interactive Inspector Side Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Map Canvas */}
        <div className="lg:col-span-3 h-[380px] md:h-[520px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative shadow-inner">
          <div ref={mapContainerRef} className="w-full h-full" />
          
          {/* Doppler Radar Sweep Overlay (SENAMHI live Doppler animation) */}
          {showRadar && (
            <div className="radar-sweep-overlay">
              <div className="radar-beam" />
            </div>
          )}

          {/* Map Legend Floating */}
          <div className="absolute bottom-3 left-3 z-10 glass-panel p-2.5 rounded-xl text-[10px] space-y-1.5 w-[calc(100%-1.5rem)] max-w-[340px] border border-slate-200 dark:border-slate-700/80 shadow-md">
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">
                {metric === 'temperature' ? 'Escala Térmica SENAMHI (°C) - Multianual' : metric === 'precipitation' ? 'Precipitación (mm)' : 'Índice UV'}
              </span>
              {metric === 'temperature' && (
                <span className="flex items-center gap-0.5 text-[9px] text-rose-500 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                  <Flame className="w-2.5 h-2.5" /> Puntos de Calor (Pin)
                </span>
              )}
            </div>
            {metric === 'temperature' ? (
              <div className="flex flex-wrap items-center justify-between gap-1 text-[8.5px] sm:text-[9.5px]">
                <span className="flex items-center gap-1 text-slate-300 font-medium"><span className="w-2 h-2 rounded-full bg-[#172554] border border-slate-500" />&lt;6° Helada</span>
                <span className="flex items-center gap-1 text-blue-400 font-medium"><span className="w-2 h-2 rounded-full bg-[#2563eb]" />10° Frío</span>
                <span className="flex items-center gap-1 text-cyan-400 font-medium"><span className="w-2 h-2 rounded-full bg-[#06b6d4]" />14° Andino</span>
                <span className="flex items-center gap-1 text-emerald-400 font-medium"><span className="w-2 h-2 rounded-full bg-[#10b981]" />18° Temp</span>
                <span className="flex items-center gap-1 text-yellow-400 font-medium"><span className="w-2 h-2 rounded-full bg-[#eab308]" />22° Cálido</span>
                <span className="flex items-center gap-1 text-orange-400 font-medium"><span className="w-2 h-2 rounded-full bg-[#f97316]" />26° Muy Cálido</span>
                <span className="flex items-center gap-1 text-rose-500 font-bold"><span className="w-2 h-2 rounded-full bg-[#dc2626]" />&gt;26° Calor</span>
              </div>
            ) : metric === 'precipitation' ? (
              <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px]">
                <span className="flex items-center gap-1 text-slate-400"><span className="w-2 h-2 rounded-full bg-[#334155]" />0mm Seco</span>
                <span className="flex items-center gap-1 text-sky-400"><span className="w-2 h-2 rounded-full bg-[#38bdf8]" />2mm Ligera</span>
                <span className="flex items-center gap-1 text-blue-500"><span className="w-2 h-2 rounded-full bg-[#2563eb]" />8mm Moderada</span>
                <span className="flex items-center gap-1 text-purple-400"><span className="w-2 h-2 rounded-full bg-[#7c3aed]" />&gt;8mm Fuerte</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px]">
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-[#10b981]" />1-2 Bajo</span>
                <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-[#eab308]" />3-5 Mod</span>
                <span className="flex items-center gap-1 text-orange-400"><span className="w-2 h-2 rounded-full bg-[#f97316]" />6-7 Alto</span>
                <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-[#ef4444]" />8-10 Muy Alto</span>
                <span className="flex items-center gap-1 text-purple-400"><span className="w-2 h-2 rounded-full bg-[#a855f7]" />11+ Ext</span>
              </div>
            )}
          </div>
        </div>

        {/* Hover / Selected Inspector Side Panel */}
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 font-semibold mb-2 uppercase tracking-wider">
              <Eye className="w-3.5 h-3.5" />
              <span>Inspector Departamental</span>
            </div>

            {hoveredDept ? (
              <div className="space-y-3">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h4 className="text-xl font-bold text-slate-900 dark:text-white">{hoveredDept.department_name}</h4>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>Capital: <strong className="text-slate-700 dark:text-slate-300">{hoveredDept.capital}</strong></span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">{hoveredDept.region_natural}</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                    <span className="text-slate-600 dark:text-slate-400">🌡️ Temperatura:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-300 text-sm">{hoveredDept.temperature}°C</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                    <span className="text-slate-600 dark:text-slate-400">💧 Humedad:</span>
                    <span className="font-bold text-sky-600 dark:text-sky-300 text-sm">{hoveredDept.relative_humidity}%</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                    <span className="text-slate-600 dark:text-slate-400">🌧️ Precipitación:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-300 text-sm">{hoveredDept.precipitation} mm</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                    <span className="text-slate-600 dark:text-slate-400">☀️ Índice UV:</span>
                    <span className="font-bold text-purple-600 dark:text-purple-300 text-sm">{hoveredDept.uv_index}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                    <span className="text-slate-600 dark:text-slate-400">💨 Viento:</span>
                    <span className="font-bold text-teal-600 dark:text-teal-300 text-sm">{hoveredDept.wind_speed} km/h</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs space-y-2">
                <MapPin className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
                <p>Pasa el cursor o haz clic sobre cualquier departamento en el mapa para inspeccionar sus datos.</p>
              </div>
            )}
          </div>

          {hoveredDept && (
            <button
              onClick={() => onSelectCityByName(hoveredDept.capital)}
              className="w-full py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs transition-all shadow-md shadow-sky-500/20"
            >
              Cargar {hoveredDept.capital} en Dashboard
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
