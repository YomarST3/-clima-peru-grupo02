import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { CurrentWeatherHero } from './components/CurrentWeatherHero';
import { MetricCardsGrid } from './components/MetricCardsGrid';
import { HourlyForecast } from './components/HourlyForecast';
import { DailyForecast } from './components/DailyForecast';
import { WeatherCharts } from './components/WeatherCharts';
import { PeruMap } from './components/PeruMap';
import { CityComparison } from './components/CityComparison';
import { ClimateAnalysis } from './components/ClimateAnalysis';
import { WeatherAlerts } from './components/WeatherAlerts';
import { RankingsSection } from './components/RankingsSection';
import { CsvImporter } from './components/CsvImporter';
import { SkeletonLoader } from './components/SkeletonLoader';
import { Footer } from './components/Footer';
import { PortalHome } from './components/PortalHome';
import { ExternalProjectView } from './components/ExternalProjectView';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { projects, PORTAL_ACTIVE_KEY } from './data/projects';
import type { PortalProject } from './data/projects';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/Auth/AuthModal';
import { AdminPanel } from './components/Admin/AdminPanel';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuth } from './context/AuthContext';
import { City, FullForecastResponse, DepartmentWeatherSummary, AlertsResponse } from './types/weather';
import { weatherApi } from './services/api';
import { generateWeatherReportPdf } from './utils/pdfExport';
import {
  MapPin,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CloudSun,
  Compass,
  BarChart3,
  Droplets,
  Wind,
  Lock,
  ArrowRight,
  Sun,
  Moon,
  LayoutGrid
} from 'lucide-react';

const AppInner: React.FC = () => {
  // Theme state ('dark' or 'light')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = localStorage.getItem('meteoperu_theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
  });

  // State
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [forecast, setForecast] = useState<FullForecastResponse | null>(null);
  const [departmentsSummary, setDepartmentsSummary] = useState<DepartmentWeatherSummary[]>([]);
  const [alertsSummary, setAlertsSummary] = useState<AlertsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [pdfPreview, setPdfPreview] = useState<{ blob: Blob; filename: string } | null>(null);
  const [isPortal, setIsPortal] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem(PORTAL_ACTIVE_KEY);
      return !stored || !projects.some((p) => p.id === stored && p.status === 'active');
    } catch {
      return true;
    }
  });
  const [externalProject, setExternalProject] = useState<PortalProject | null>(null);
  const { isAdmin, isAuthenticated } = useAuth();

  const openProject = (projectId: string) => {
    const target = projects.find((p) => p.id === projectId && p.status === 'active');
    if (target?.url) {
      setExternalProject(target);
      window.scrollTo(0, 0);
      return;
    }
    try {
      sessionStorage.setItem(PORTAL_ACTIVE_KEY, projectId);
    } catch {
      /* noop */
    }
    setIsPortal(false);
    window.scrollTo(0, 0);
  };

  const backToPortal = () => {
    try {
      sessionStorage.removeItem(PORTAL_ACTIVE_KEY);
    } catch {
      /* noop */
    }
    setExternalProject(null);
    setIsPortal(true);
    window.scrollTo(0, 0);
  };

  // Guard: si se intenta acceder al panel admin sin ser admin, volver al dashboard
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('dashboard');
    }
  }, [activeTab, isAdmin]);

  // Determine day/night time for dynamic atmospheric background
  const currentHour = new Date().getHours();
  const isDayTime = currentHour >= 6 && currentHour < 19;

  // Sync theme with HTML documentElement and localStorage
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('meteoperu_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Load initial cities catalogue
  useEffect(() => {
    const loadCities = async () => {
      try {
        const cityList = await weatherApi.getCities();
        setCities(cityList);
        // Default to Lima or first city
        const defaultCity = cityList.find(c => c.name === 'Lima') || cityList[0];
        if (defaultCity) {
          setSelectedCity(defaultCity);
        }
      } catch (err: any) {
        console.error('Error cargando ciudades:', err);
        setError('No se pudo conectar con el servidor meteorológico.');
        setIsLoading(false);
      }
    };

    loadCities();
  }, []);

  // Load overview for map and general alerts
  const loadGlobalOverview = useCallback(async () => {
    try {
      const [overviewData, alertsData] = await Promise.all([
        weatherApi.getOverview(),
        weatherApi.getAlerts()
      ]);
      setDepartmentsSummary(overviewData);
      setAlertsSummary(alertsData);
    } catch (err) {
      console.error('Error loading global overview:', err);
    }
  }, []);

  useEffect(() => {
    loadGlobalOverview();
  }, [loadGlobalOverview]);

  //Refresca el overview (mapa/dashboard) al volver a la pestaña Mapa
  useEffect(() => {
    if (activeTab === 'map') {
      loadGlobalOverview();
    }
  }, [activeTab, loadGlobalOverview]);

  // Load weather for selected city
  const loadCityWeather = useCallback(async (city: City, showRefreshing: boolean = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const data = await weatherApi.getForecast(city.id);
      setForecast(data);
    } catch (err: any) {
      console.error('Error cargando pronóstico:', err);
      setError(`Error al consultar datos meteorológicos de ${city.name}. Intente de nuevo.`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCity) {
      loadCityWeather(selectedCity);
    }
  }, [selectedCity, loadCityWeather]);

  // Después de guardar el dataset real, refresca overview + pronóstico seleccionado
  const handleDatasetSaved = useCallback(async () => {
    loadGlobalOverview();
    if (selectedCity) {
      loadCityWeather(selectedCity, true);
    }
  }, [loadGlobalOverview, loadCityWeather, selectedCity]);

  // Handle City Selection
  const handleSelectCity = (city: City) => {
    setSelectedCity(city);
  };

  const handleSelectCityByName = (cityName: string) => {
    const found = cities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
    if (found) {
      setSelectedCity(found);
      setActiveTab('dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // User Geolocation
  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada por su navegador.');
      return;
    }

    setIsRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const data = await weatherApi.getForecast(undefined, latitude, longitude);
          setForecast(data);
          // Create temp city object
          setSelectedCity({
            id: 0,
            department_id: 0,
            name: data.current.city_name || 'Mi Ubicación',
            latitude,
            longitude,
            altitude: 0,
            is_featured: false,
            is_capital: false,
            department_name: data.current.department_name || 'Perú',
            region_natural: 'Costa'
          });
          setActiveTab('dashboard');
        } catch (e) {
          alert('Error al consultar el clima de sus coordenadas.');
        } finally {
          setIsRefreshing(false);
        }
      },
      (err) => {
        setIsRefreshing(false);
        alert('No se pudo acceder a su ubicación: ' + err.message);
      },
      { timeout: 10000 }
    );
  };

  // Refresh data
  const handleRefresh = () => {
    if (selectedCity) {
      loadCityWeather(selectedCity, true);
      loadGlobalOverview();
    }
  };

  // Export forecast as PDF (preview in modal with download button)
  const handleExportForecast = () => {
    const openPdfPreview = (data: FullForecastResponse) => {
      try {
        const { blob, filename } = generateWeatherReportPdf(data, selectedCity);
        setPdfPreview({ blob, filename });
      } catch (err) {
        console.error('Error al generar el reporte PDF:', err);
      }
    };

    if (forecast) {
      openPdfPreview(forecast);
    } else if (selectedCity) {
      weatherApi.getForecast(selectedCity.id).then((data) => {
        openPdfPreview(data);
      });
    }
  };

  // Featured Quick Select Cities for Peru
  const featuredQuickCities = [
    'Lima', 'Arequipa', 'Cusco', 'Piura', 'Trujillo',
    'Chiclayo', 'Iquitos', 'Huancayo', 'Puno', 'Tacna', 'Chimbote'
  ];

  if (externalProject) {
    return (
      <ExternalProjectView
        project={externalProject}
        onBack={backToPortal}
      />
    );
  }

  if (isPortal) {
    return (
      <PortalHome
        onOpenProject={openProject}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100 selection:bg-sky-500 selection:text-white transition-colors duration-300">

      {!isAuthenticated ? (
        /* ===== Pantalla de Bienvenida Cinematográfica con Video de Fondo Optimizado ===== */
        <div className="min-h-screen flex flex-col items-center justify-between text-center relative overflow-hidden bg-slate-950 px-4 py-8 sm:py-12">
          {/* Atmospheric Video Background (Alto rendimiento, sin lag ni filtros pesados) */}
          <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-cover transform-gpu pointer-events-none"
            >
              <source src="/background.mp4" type="video/mp4" />
            </video>
            {/* Capas de contraste visual ligeras sin backdrop-blur para máxima fluidez a 60fps */}
            <div className="absolute inset-0 bg-slate-950/45 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-slate-950/50 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-500/15 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Top Brand Bar */}
          <header className="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <button
                onClick={backToPortal}
                title="Volver al Portal de Proyectos"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold backdrop-blur-md transition-all shadow-sm"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Portal</span>
              </button>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-500 to-sky-500 p-0.5 shadow-xl shadow-sky-500/20">
                <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                  <span className="text-base font-black text-white">PE</span>
                </div>
              </div>
              <div className="text-left">
                <span className="text-lg font-black tracking-tight text-white">
                  METEO<span className="text-sky-400">PERÚ</span>
                </span>
                <span className="ml-1.5 px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                  PRO
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsAuthOpen(true)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold backdrop-blur-md transition-all shadow-sm"
            >
              Acceso Institucional
            </button>
          </header>

          {/* Center Hero Glass Card */}
          <div className="relative z-10 max-w-3xl w-full mx-auto my-auto py-8">
            {/* Dynamic Day/Night Status Pill */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-sky-500/30 backdrop-blur-xl mb-6 shadow-xl animate-fadeIn">
              {isDayTime ? (
                <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
              ) : (
                <Moon className="w-4 h-4 text-sky-300" />
              )}
              <span className="text-xs font-bold text-slate-200">
                {isDayTime
                  ? '☀️ Vista Diurna en Vivo · Sol & Nubes sobre Perú'
                  : '🌙 Vista Nocturna en Vivo · Luna & Nubes sobre Perú'}
              </span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400 ml-0.5" />
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight mb-4">
              Monitoreo del Clima en <br />
              <span className="bg-gradient-to-r from-sky-400 via-rose-400 to-amber-300 bg-clip-text text-transparent">
                Tiempo Real para el Perú
              </span>
            </h1>

            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto mb-8 font-normal leading-relaxed drop-shadow">
              Pronósticos satelitales de alta precisión, comparador interregional, alertas meteorológicas, análisis histórico y reportes oficiales en PDF.
            </p>

            {/* Live Weather Cities Ribbon (Interactive Preview) */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap mb-8">
              {[
                { city: 'Lima', temp: '23°C', icon: '☀️', cond: 'Despejado' },
                { city: 'Cusco', temp: '18°C', icon: '⛅', cond: 'Parcial' },
                { city: 'Arequipa', temp: '21°C', icon: '🌤️', cond: 'Soleado' },
                { city: 'Iquitos', temp: '31°C', icon: '🌧️', cond: 'Húmedo' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/10 backdrop-blur-md text-xs font-semibold text-white shadow-md hover:border-sky-500/40 transition-colors"
                >
                  <span>{item.icon}</span>
                  <span className="text-slate-300">{item.city}:</span>
                  <span className="text-sky-400 font-bold">{item.temp}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-base shadow-xl shadow-sky-500/30 transition-all hover:scale-[1.03] flex items-center justify-center gap-3"
              >
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
                <span>Iniciar Sesión / Acceder</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bottom Features Cards */}
          <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-white/10">
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md text-left">
              <Compass className="w-4 h-4 text-sky-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Mapa & 25 Regiones</div>
              <div className="text-[11px] text-slate-400">Costa, Sierra y Selva</div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md text-left">
              <CloudSun className="w-4 h-4 text-amber-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Pronóstico de 7 Días</div>
              <div className="text-[11px] text-slate-400">Por horas & radiación UV</div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md text-left">
              <BarChart3 className="w-4 h-4 text-emerald-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Análisis & Comparador</div>
              <div className="text-[11px] text-slate-400">Histórico multivariado</div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md text-left">
              <ShieldCheck className="w-4 h-4 text-rose-400 mb-1.5" />
              <div className="text-xs font-bold text-white">Reportes Oficiales PDF</div>
              <div className="text-[11px] text-slate-400">Exportación estructurada</div>
            </div>
          </div>

          {/* Auth Modal */}
          <AuthModal
            open={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
          />
        </div>
      ) : (
        <>
      {/* Top Navigation with Sol y Luna Toggle */}
      <Navbar
        cities={cities}
        selectedCity={selectedCity}
        onSelectCity={handleSelectCity}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onLocateUser={handleLocateUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        alertsCount={alertsSummary ? alertsSummary.danger_count + alertsSummary.warning_count : 0}
        onExportForecast={handleExportForecast}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenAuth={() => setIsAuthOpen(true)}
        onBackToPortal={backToPortal}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Quick Featured Cities Carousel Chips (Hidden on Admin Tab) */}
        {activeTab !== 'admin' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] shrink-0 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              Acceso Rápido:
            </span>
            {featuredQuickCities.map((cName) => {
              const isCurrent = selectedCity?.name === cName;
              return (
                <button
                  key={cName}
                  onClick={() => handleSelectCityByName(cName)}
                  className={`px-3 py-1 rounded-full whitespace-nowrap transition-all font-medium ${
                    isCurrent
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20 font-bold'
                      : 'bg-white/90 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 shadow-sm dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:text-slate-300 dark:border-slate-800'
                  }`}
                >
                  {cName}
                </button>
              );
            })}
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-red-600 dark:text-red-300 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-200 font-semibold transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Dynamic View Rendering based on activeTab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {isLoading || !forecast ? (
              <SkeletonLoader />
            ) : (
              <>
                {/* 1. Hero Weather Card */}
                <CurrentWeatherHero weather={forecast.current} />

                {/* 2. Key Metrics Grid (6 cards) */}
                <MetricCardsGrid weather={forecast.current} />

                {/* 3. 24-Hour Forecast Carousel */}
                <HourlyForecast hourly={forecast.hourly} />

                {/* 4. Forecast Charts & 7-Day Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <WeatherCharts hourly={forecast.hourly} theme={theme} />
                  <DailyForecast daily={forecast.daily} />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <PeruMap
            departmentsSummary={departmentsSummary}
            onSelectCityByName={handleSelectCityByName}
            selectedCity={selectedCity}
            theme={theme}
          />
        )}

        {activeTab === 'compare' && (
          <CityComparison cities={cities} />
        )}

        {activeTab === 'analysis' && (
          <ClimateAnalysis cities={cities} selectedCity={selectedCity} />
        )}

        {activeTab === 'alerts' && (
          <WeatherAlerts
            selectedCity={selectedCity}
            onSelectCityByName={handleSelectCityByName}
          />
        )}

        {activeTab === 'rankings' && (
          <RankingsSection onSelectCityByName={handleSelectCityByName} />
        )}

        {activeTab === 'csv' && (
          <CsvImporter theme={theme} onDatasetSaved={handleDatasetSaved} />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminPanel theme={theme} />
        )}

      </main>

      {/* Footer */}
      <Footer />

      {/* Auth Modal */}
      <AuthModal open={isAuthOpen} onClose={() => setIsAuthOpen(false)} />

      {/* PDF Preview Modal */}
      {pdfPreview && (
        <PdfPreviewModal
          blob={pdfPreview.blob}
          filename={pdfPreview.filename}
          onClose={() => setPdfPreview(null)}
        />
      )}
        </>
      )}

    </div>
  );
};

const DEFAULT_GOOGLE_CLIENT_ID = '119978105289-3bh4bsvlad5vint3tnlbp9iiu4bprg31.apps.googleusercontent.com';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

export const App: React.FC = () => {
  const content = (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );

  if (googleClientId) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        {content}
      </GoogleOAuthProvider>
    );
  }

  return content;
};

export default App;

