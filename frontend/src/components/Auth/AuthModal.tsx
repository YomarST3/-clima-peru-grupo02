import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Mail,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Sparkles,
  Lock,
} from 'lucide-react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/authApi';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose }) => {
  const { setSession } = useAuth();

  // Mode: 'google' (default) | 'password_login' (con contraseña para admins)
  const [authMode, setAuthMode] = useState<'google' | 'password_login'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const DEFAULT_GOOGLE_CLIENT_ID = '119978105289-3bh4bsvlad5vint3tnlbp9iiu4bprg31.apps.googleusercontent.com';
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;

  const googleWrapRef = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(360);

  useEffect(() => {
    const update = () => {
      const el = googleWrapRef.current;
      if (el) setGoogleWidth(Math.max(200, Math.min(360, el.clientWidth)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!open) return null;

  const resetForm = () => {
    setError(null);
    setInfo(null);
    setEmail('');
    setPassword('');
    setAuthMode('google');
  };

  // Autenticación con Google (Google Identity Services)
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('No se recibió la credencial de autenticación de Google');
      return;
    }

    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await authApi.loginWithGoogle({
        credential: credentialResponse.credential,
      });
      setSession(res.access_token, res.user);
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Error al autenticar con Google');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('No se pudo completar la autenticación con Google');
  };

  // Iniciar sesión con contraseña (para administradores)
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      setSession(res.access_token, res.user);
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full pl-10 pr-3.5 py-3 bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 rounded-2xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all shadow-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-md glass-panel rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xl overflow-hidden relative">
        {/* Top Glowing Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-rose-500 to-sky-500" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-500 to-sky-500 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <span className="text-base font-black text-white">PE</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  METEO<span className="text-sky-500">PERÚ</span>
                </h3>
                <span className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-bold">
                  PRO
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Iniciar Sesión en el Sistema
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-2xl px-3.5 py-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {/* Info Message */}
          {info && (
            <div className="flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-3.5 py-2.5 animate-fadeIn">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{info}</span>
            </div>
          )}

          {/* MODO PRINCIPAL: Google Sign-In */}
          {authMode === 'google' && (
            <div className="space-y-5 py-2">
              <div className="text-center space-y-1.5">
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Acceso con Google
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Inicia sesión de forma rápida y segura con tu cuenta de Google. Tu perfil se creará o vinculará automáticamente.
                </p>
              </div>

              {/* Botón Google centrado y responsive */}
              <div className="flex justify-center w-full pt-2">
                <div ref={googleWrapRef} className="w-full flex justify-center overflow-hidden rounded-full shadow-lg shadow-black/30 hover:opacity-95 transition-opacity">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="filled_black"
                    shape="pill"
                    size="large"
                    text="continue_with"
                    width={googleWidth}
                  />
                </div>
              </div>

              {/* Enlace discreto para administradores con contraseña */}
              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthMode('password_login');
                  }}
                  className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
                >
                  ¿Acceso con contraseña? Haz clic aquí
                </button>
              </div>
            </div>
          )}

          {/* MODO SECUNDARIO: Ingreso con Contraseña para Administradores */}
          {authMode === 'password_login' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4 animate-fadeIn">
              <div className="text-center space-y-1 mb-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
                  <Lock className="w-4 h-4 text-sky-400" />
                  <span>Acceso con Contraseña</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Para administradores del sistema
                </p>
              </div>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Correo electrónico"
                  className={inputClass}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-bold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>Ingresar al Sistema</span>
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('google')}
                  className="text-xs text-sky-500 hover:underline"
                >
                  Volver al acceso con Google
                </button>
              </div>
            </form>
          )}

          {/* Footer Informativo */}
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sin registro manual · Tu cuenta se crea automáticamente</span>
          </div>
        </div>
      </div>
    </div>
  );
};
