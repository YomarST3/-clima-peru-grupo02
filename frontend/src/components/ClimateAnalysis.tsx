import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import {
  BarChart3,
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Thermometer,
  CloudRain,
  Wind
} from 'lucide-react';
import { City, HistoryResponse } from '../types/weather';
import { weatherApi } from '../services/api';

interface ClimateAnalysisProps {
  cities: City[];
  selectedCity: City | null;
}

export const ClimateAnalysis: React.FC<ClimateAnalysisProps> = ({ cities, selectedCity }) => {
  const [cityId, setCityId] = useState<number>(selectedCity?.id || 1);
  const [variable, setVariable] = useState<string>('temperature');
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with selectedCity if it changes outside
  useEffect(() => {
    if (selectedCity) {
      setCityId(selectedCity.id);
    }
  }, [selectedCity]);

  // Load history data
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);

      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - rangeDays);

      const endStr = endDate.toISOString().split('T')[0];
      const startStr = startDate.toISOString().split('T')[0];

      try {
        const data = await weatherApi.getHistory(cityId, startStr, endStr, variable);
        setHistoryData(data);
      } catch (err: any) {
        setError(err.message || 'Error al procesar el análisis histórico');
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [cityId, variable, rangeDays]);

  const handleDownloadCsv = () => {
    const url = weatherApi.getExportCsvUrl(cityId, 'history', rangeDays);
    window.open(url, '_blank');
  };

  const chartData = historyData?.data.map((d) => ({
    date: d.date.split('-').slice(1).join('/'),
    temp_max: d.temp_max,
    temp_min: d.temp_min,
    temp_mean: d.temp_mean,
    precipitation: d.precipitation_sum,
    wind: d.wind_speed_max
  })) || [];

  const getTrendIcon = (trend: string) => {
    if (trend === 'ascendente') return <TrendingUp className="w-4 h-4 text-rose-400" />;
    if (trend === 'descendente') return <TrendingDown className="w-4 h-4 text-cyan-400" />;
    return <Minus className="w-4 h-4 text-amber-400" />;
  };

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-500 dark:text-sky-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Análisis Climático e Historial del Perú
            </h3>
            {historyData?.data_source === 'real' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                Datos Reales
              </span>
            )}
            {historyData?.data_source === 'simulado' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30">
                Datos Simulados
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {historyData?.data_source === 'real'
              ? `Serie con registros reales del dataset nacional (${historyData?.stats.days_analyzed} días cargados).`
              : 'Estudio estadístico y series temporales climatológicas con registros diarios.'}
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* City Selector */}
          <select
            value={cityId}
            onChange={(e) => setCityId(Number(e.target.value))}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500 shadow-sm"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.department_name})
              </option>
            ))}
          </select>

          {/* Variable Selector */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <button
              onClick={() => setVariable('temperature')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                variable === 'temperature' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Temperatura
            </button>
            <button
              onClick={() => setVariable('precipitation')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                variable === 'precipitation' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Lluvia
            </button>
            <button
              onClick={() => setVariable('wind')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                variable === 'wind' ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Viento
            </button>
          </div>

          {/* Range Selector */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            {[7, 15, 30].map((days) => (
              <button
                key={days}
                onClick={() => setRangeDays(days)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  rangeDays === days ? 'bg-sky-500 text-white font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>

          {/* CSV Download Button */}
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Statistical Summary Cards */}
      {historyData?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          
          <div className="glass-card p-4 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Promedio</span>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {historyData.stats.average} {variable === 'temperature' ? '°C' : variable === 'precipitation' ? ' mm' : ' km/h'}
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">En los últimos {historyData.stats.days_analyzed} días</span>
          </div>

          <div className="glass-card p-4 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Máximo Histórico</span>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              {historyData.stats.maximum} {variable === 'temperature' ? '°C' : variable === 'precipitation' ? ' mm' : ' km/h'}
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Pico más alto</span>
          </div>

          <div className="glass-card p-4 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Mínimo Histórico</span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {historyData.stats.minimum} {variable === 'temperature' ? '°C' : variable === 'precipitation' ? ' mm' : ' km/h'}
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Registro más bajo</span>
          </div>

          <div className="glass-card p-4 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Tendencia Climática</span>
            <div className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-200 mt-1 capitalize">
              {getTrendIcon(historyData.stats.trend)}
              <span>{historyData.stats.trend}</span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Evolución térmica</span>
          </div>

        </div>
      )}

      {/* Historical Chart */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {historyData?.city_name} — Serie de tiempo ({historyData?.start_date} al {historyData?.end_date})
          </span>
          <span>{historyData?.stats.days_analyzed} registros diarios</span>
        </div>

        <div className="h-72 w-full pt-2">
          {isLoading ? (
            <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">
              Cargando serie histórica de datos...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {variable === 'precipitation' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:opacity-20" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" mm" />
                  <Tooltip />
                  <Bar dataKey="precipitation" name="Precipitación Diaria" unit=" mm" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histTempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={variable === 'wind' ? '#2dd4bf' : '#f59e0b'} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={variable === 'wind' ? '#2dd4bf' : '#f59e0b'} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:opacity-20" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit={variable === 'wind' ? ' k/h' : '°C'} />
                  <Tooltip />
                  {variable === 'temperature' ? (
                    <>
                      <Area type="monotone" dataKey="temp_max" name="Temp Máxima" unit="°C" stroke="#ef4444" strokeWidth={1.5} fill="none" />
                      <Area type="monotone" dataKey="temp_mean" name="Temp Media" unit="°C" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#histTempGradient)" />
                      <Area type="monotone" dataKey="temp_min" name="Temp Mínima" unit="°C" stroke="#06b6d4" strokeWidth={1.5} fill="none" />
                    </>
                  ) : (
                    <Area type="monotone" dataKey="wind" name="Viento Máximo" unit=" km/h" stroke="#2dd4bf" strokeWidth={2.5} fillOpacity={1} fill="url(#histTempGradient)" />
                  )}
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
};
