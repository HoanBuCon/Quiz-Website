import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MAINTENANCE_MESSAGE, MAINTENANCE_VIDEO_URL, IS_MAINTENANCE_MODE } from '../utils/maintenanceConfig';
import { getToken, setToken, clearToken } from '../utils/auth';
import { AuthAPI } from '../utils/api';
import { useData } from '../context/DataContext';

type TabType = 'start' | 'login' | 'register' | 'forgot-password';

// Render Form Input Helper - Moved outside to prevent re-renders causing focus loss
const InputField = ({
  type,
  placeholder,
  value,
  onChange,
  icon,
  maxLength
}: {
  type: string,
  placeholder: string,
  value: string,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  icon: React.ReactNode,
  maxLength?: number
}) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const isPassword = type === 'password';

  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-orange-500 transition-colors">
        {icon}
      </div>
      <input
        type={isPassword ? (showPassword ? 'text' : 'password') : type}
        className={`w-full bg-white/5 border border-white/10 rounded-lg py-3 pl-10 ${isPassword ? 'pr-12' : 'pr-4'} text-white placeholder-gray-400 focus:outline-none focus:border-orange-500/50 focus:bg-white/10 transition-all`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {showPassword ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};

const MaintenancePage: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const navigate = useNavigate();
  const { enterWebsite } = useData();

  const [isLoggedIn, setIsLoggedIn] = useState(!!getToken());
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('start');

  // Form States
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Forgot Password States
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [isProcessStarting, setIsProcessStarting] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Sync isLoggedIn state
    const token = getToken();
    setIsLoggedIn(!!token);
    if (token) {
      setActiveTab('start');
      AuthAPI.me(token)
        .then(res => setCurrentUser(res.user))
        .catch(() => {
          // Token might be invalid, but we let the user try to start and fail or handle logout manually
        });
    } else {
      setActiveTab('login');
    }
  }, []);

  const handleStart = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => { });
    }

    // Bắt đầu chạy Process Bar
    setIsProcessStarting(true);

    // Cấu hình thời gian 5 giây
    const DURATION = 5000;
    const INTERVAL = 50;
    const STEP = 100 / (DURATION / INTERVAL);

    let currentProgress = 0;

    const timer = setInterval(() => {
      currentProgress += STEP;

      // Cập nhật tiến độ
      setLoadingProgress(Math.min(currentProgress, 100));

      if (currentProgress >= 100) {
        clearInterval(timer);

        // Đợi 0.5s cho mượt rồi mới chuyển màn hình
        setTimeout(() => {
          setIsProcessStarting(false);
          setIsPlaying(true); // Chuyển sang màn hình chính

          // Logic cũ kiểm tra bảo trì/login
          if (IS_MAINTENANCE_MODE) {
            setShowMaintenance(true);
          } else {
            if (getToken()) {
              setActiveTab('start');
            } else {
              setActiveTab('login');
            }
          }
        }, 500);
      }
    }, INTERVAL);
  };

  const handleEnterWebsite = () => {
    // Kích hoạt animation biến mất
    setIsExiting(true);

    enterWebsite();

    // Đợi 0.8s cho animation chạy xong rồi mới navigate
    setTimeout(() => {
      navigate('/');
    }, 800);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setIsLoading(true);
    try {
      const response = await AuthAPI.login(email, password);
      setToken(response.token);
      setIsLoggedIn(true);
      setCurrentUser(response.user);
      setActiveTab('start');
      toast.success('Đăng nhập thành công!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !email || !fullName || !confirmPassword) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setIsLoading(true);
    try {
      await AuthAPI.register({
        password,
        email,
        name: fullName
      });
      toast.success('Đăng ký thành công! Vui lòng đăng nhập.');
      setActiveTab('login');
      // Clear form
      setPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đăng ký thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast.error('Vui lòng nhập email');
      return;
    }

    setIsLoading(true);
    try {
      await AuthAPI.forgotOtp(forgotEmail);
      toast.success('Mã OTP đã được gửi đến email của bạn');
      setForgotStep(2);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gửi OTP thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPassword || !confirmNewPassword) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setIsLoading(true);
    try {
      await AuthAPI.resetWithOtp(forgotEmail, otp, newPassword);
      toast.success('Đặt lại mật khẩu thành công! Vui lòng đăng nhập.');
      setActiveTab('login');
      // Reset states
      setForgotStep(1);
      setForgotEmail('');
      setOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đặt lại mật khẩu thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Preload video
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <style>{`
      @keyframes scanline {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .animate-scanline {
        animation: scanline 2s linear infinite;
      }
      .exit-animation {
        animation: warpOut 0.8s cubic-bezier(0.7, 0, 0.84, 0) forwards;
      }
      @keyframes warpOut {
        0% { opacity: 1; transform: scale(1); filter: blur(0px); }
        100% { opacity: 0; transform: scale(2); filter: blur(10px); }
      }
      /* Hide default password toggle in Edge/IE */
      input::-ms-reveal,
      input::-ms-clear {
        display: none;
      }
      `}</style>

      {/* Video Background */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 w-full h-full object-cover"
        loop
        playsInline
        preload="auto"
      >
        <source src={MAINTENANCE_VIDEO_URL} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Dark Overlay */}
      <div
        className={`absolute inset-0 transition-all duration-700
          ${isPlaying ? "bg-black/20" : "bg-black/40"}
        `}
      />

      {/* Content Container - Đã thêm class exit-animation */}
      <div className={`relative z-10 flex flex-col items-center justify-center h-full px-4 w-full ${isExiting ? "exit-animation" : ""}`}>

        {/* CASE 1: MÀN HÌNH CHỜ (Chưa bấm nút) */}
        {!isProcessStarting && !isPlaying && (
          <div className="text-center animate-fadeIn flex flex-col items-center">
            <div className="mb-6 flex flex-col items-center">
              <img
                src={MAINTENANCE_MESSAGE.brand.logo}
                alt={MAINTENANCE_MESSAGE.brand.text + " Logo"}
                className="w-20 h-20 object-contain mb-4"
              />
              <span className="text-4xl sm:text-5xl lg:text-6xl font-bold logo-text text-white dark:text-primary-300">
                {MAINTENANCE_MESSAGE.brand.text}
              </span>
            </div>

            <button
              onClick={handleStart}
              className="
                group relative inline-flex items-center gap-4 
                px-8 py-4 rounded-xl
                bg-white/10 backdrop-blur-xl border border-white/20
                shadow-[0_0_25px_rgba(255,200,100,0.18)]
                hover:shadow-[0_0_35px_rgba(255,200,150,0.28)]
                transition-all duration-300 active:scale-95
                text-white font-semibold text-xl
                select-none overflow-hidden w-auto
              "
            >
              <div
                className="
                  w-10 h-10 flex items-center justify-center rounded-full
                  bg-gradient-to-br from-orange-500 to-amber-400
                  shadow-lg transition-transform duration-300 
                  relative z-10 group-hover:scale-110
                "
              >
                <svg className="w-6 h-6 text-white translate-x-[1px]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
                </svg>
              </div>

              <span className="tracking-wide text-lg font-mono relative z-10">
                Liếm luôn
              </span>

              {/* Soft Shimmer */}
              <div
                className="
                  absolute inset-0 rounded-full pointer-events-none
                  -translate-x-full group-hover:translate-x-full
                  transition-transform duration-0 group-hover:duration-[1000ms] ease-out
                  bg-gradient-to-r from-transparent via-white/10 to-transparent
                  blur-[1px]
                "
                style={{ zIndex: 1 }}
              />
            </button>
          </div>
        )}

        {/* CASE 2: THANH LOADING (Đang chạy 5s) - BỔ SUNG MỚI */}
        {isProcessStarting && (
          <div className="w-full max-w-xl px-8 animate-fadeIn">
            {/* Tech Text */}
            <div className="flex justify-between text-xs font-mono text-orange-400/80 mb-2 tracking-widest">
              <span>SYSTEM_INIT</span>
              <span>{Math.round(loadingProgress)}%</span>
            </div>

            {/* Progress Track */}
            <div className="h-2 w-full bg-gray-900 rounded-full overflow-hidden border border-white/10 relative shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              {/* Progress Fill */}
              <div
                className="h-full bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-400 transition-all duration-75 ease-linear relative"
                style={{ width: `${loadingProgress}%` }}
              >
                {/* Glare effect on the bar */}
                <div className="absolute inset-0 bg-white/30 w-full animate-scanline" />
                {/* Glow tip */}
                <div className="absolute right-0 top-0 bottom-0 w-2 bg-white blur-[2px]" />
              </div>
            </div>

            {/* Random Tech Loading Text */}
            <div className="mt-4 text-center">
              <p className="text-gray-400 font-mono text-sm animate-pulse">
                {loadingProgress < 30 ? "Đang kết nối máy chủ vệ tinh..." :
                  loadingProgress < 60 ? "Đang tải tài nguyên siêu cấp..." :
                    loadingProgress < 90 ? "Đồng bộ hóa dữ liệu người dùng..." :
                      "Hoàn tất thiết lập..."}
              </p>
            </div>
          </div>
        )}

        {/* CASE 3: MAIN CONTENT (Đã load xong) */}
        {isPlaying && !isProcessStarting && (
          <>
            {showMaintenance ? (
              // ============================
              //   MÀN HÌNH BẢO TRÌ
              // ============================
              <div className="text-center animate-slideUp">
                <div className="flex flex-col items-center justify-center mb-8">
                  <img
                    src={MAINTENANCE_MESSAGE.brand.logo}
                    alt={MAINTENANCE_MESSAGE.brand.text + " Logo"}
                    className="w-20 h-20 object-contain mb-4"
                  />
                  <span className="text-5xl sm:text-6xl lg:text-7xl font-bold logo-text text-white dark:text-primary-300">
                    {MAINTENANCE_MESSAGE.brand.text}
                  </span>
                </div>
                <div className="mb-8 space-y-3">
                  <p className="text-2xl font-semibold text-yellow-500 mb-2">{MAINTENANCE_MESSAGE.content.title}</p>
                  <p className="text-lg text-gray-300 max-w-2xl mx-auto">{MAINTENANCE_MESSAGE.content.description}</p>
                  <p className="text-md text-gray-400 italic">{MAINTENANCE_MESSAGE.content.estimatedTime}</p>
                </div>
                <div className="flex items-center justify-center gap-2 mb-8">
                  <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-3 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <div className="mt-12 text-center">
                  <p className="text-sm text-gray-400 mb-2">Nếu cần hỗ trợ khẩn cấp, vui lòng liên hệ:</p>
                  <a href="http://hoanbucon.id.vn/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 font-medium transition-colors">hoanbucon.id.vn</a>
                </div>
              </div>
            ) : (
              // ============================
              //   MÀN HÌNH LOGIN / REGISTER / START / FORGOT
              // ============================
              <div className="w-full max-w-md animate-fadeIn">
                {/* Logo Header */}
                <div className="text-center mb-8">
                  <img
                    src={MAINTENANCE_MESSAGE.brand.logo}
                    alt="Logo"
                    className="w-16 h-16 object-contain mx-auto mb-2"
                  />
                  <h2 className="text-3xl font-bold text-white logo-text">{MAINTENANCE_MESSAGE.brand.text}</h2>
                </div>

                {/* Main Card */}
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">

                  {/* START SCREEN (Logged In) */}
                  {activeTab === 'start' && (
                    <div className="text-center space-y-6 animate-fadeIn">
                      <h3 className="text-2xl font-sans italic text-white my-6">
                        Xin chào {currentUser?.name}!
                      </h3>
                      <button
                        onClick={handleEnterWebsite}
                        className="
                          w-full relative group inline-flex items-center justify-center
                          px-10 py-4 rounded-lg
                          bg-[#0d1a22]/60 border border-cyan-400/40
                          text-cyan-300 font-semibold tracking-[0.25em]
                          shadow-[0_0_25px_rgb(0,255,255,0.25)]
                          transition-all duration-300 active:scale-95
                          overflow-hidden
                        "
                      >
                        {/* Glow Overlay */}
                        <div
                          className="
                            absolute inset-0 
                            bg-gradient-to-b from-cyan-400/10 to-cyan-300/5
                            opacity-40 group-hover:opacity-60
                            transition-all duration-300
                          "
                        />

                        {/* Soft Shimmer Line */}
                        <div
                          className="
                            absolute inset-0
                            -translate-x-full group-hover:translate-x-full
                            transition-transform duration-[1200ms] ease-out
                            bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent
                          "
                        />

                        {/* Hover Glow Border */}
                        <div
                          className="
                            absolute inset-0 rounded-lg 
                            group-hover:shadow-[0_0_15px_3px_rgb(0,255,255,0.55)]
                            transition-all duration-300
                          "
                        />

                        {/* Particle Layer */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          {[...Array(14)].map((_, i) => (
                            <div
                              key={i}
                              className={`
                                absolute bg-cyan-300/40 rounded-full
                                animate-particleFloat
                              `}
                              style={{
                                width: Math.random() * 2 + 1 + "px",
                                height: Math.random() * 2 + 1 + "px",
                                top: Math.random() * 100 + "%",
                                left: Math.random() * 100 + "%",
                                animationDelay: Math.random() * 3 + "s",
                                animationDuration: 3 + Math.random() * 5 + "s",
                              }}
                            />
                          ))}
                        </div>

                        {/* Text */}
                        <span className="relative z-10 font-mono text-xl tracking-[0.25em]">
                          START
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          clearToken();
                          setIsLoggedIn(false);
                          setActiveTab('login');
                        }}
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  )}

                  {/* LOGIN SCREEN */}
                  {activeTab === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-5 animate-fadeIn">
                      <h3 className="text-xl font-bold text-white text-center mb-6">Đăng nhập</h3>

                      <InputField
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2z" /></svg>}
                      />

                      <InputField
                        type="password"
                        placeholder="Mật khẩu"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                      />

                      <div className="flex justify-end">
                        <button type="button" onClick={() => setActiveTab('forgot-password')} tabIndex={-1} className="text-sm text-orange-400 hover:text-orange-300">
                          Quên mật khẩu?
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
                      </button>

                      <div className="text-center text-sm text-gray-400 mt-4">
                        Chưa có tài khoản?{' '}
                        <button type="button" onClick={() => setActiveTab('register')} className="text-orange-400 hover:text-orange-300 font-medium">
                          Đăng ký ngay
                        </button>
                      </div>
                    </form>
                  )}

                  {/* REGISTER SCREEN */}
                  {activeTab === 'register' && (
                    <form onSubmit={handleRegister} className="space-y-4 animate-fadeIn">
                      <h3 className="text-xl font-bold text-white text-center mb-6">Đăng ký</h3>

                      <InputField
                        type="text"
                        placeholder="Tên tài khoản"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        maxLength={30}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .884-.95 2-2.5 2H10" /></svg>}
                      />

                      <InputField
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2z" /></svg>}
                      />

                      <InputField
                        type="password"
                        placeholder="Mật khẩu"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                      />

                      <InputField
                        type="password"
                        placeholder="Xác nhận mật khẩu"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      />

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 mt-2"
                      >
                        {isLoading ? 'Đang xử lý...' : 'Đăng ký'}
                      </button>

                      <div className="text-center text-sm text-gray-400 mt-4">
                        Đã có tài khoản?{' '}
                        <button type="button" onClick={() => setActiveTab('login')} className="text-orange-400 hover:text-orange-300 font-medium">
                          Đăng nhập
                        </button>
                      </div>
                    </form>
                  )}

                  {/* FORGOT PASSWORD SCREEN */}
                  {activeTab === 'forgot-password' && (
                    <div className="space-y-5 animate-fadeIn">
                      <h3 className="text-xl font-bold text-white text-center mb-6">
                        {forgotStep === 1 ? 'Quên mật khẩu' : 'Đặt lại mật khẩu'}
                      </h3>

                      {forgotStep === 1 ? (
                        <form onSubmit={handleForgotSubmit} className="space-y-4">
                          <p className="text-gray-300 text-center text-sm mb-4">
                            Nhập email của bạn để nhận mã OTP đặt lại mật khẩu.
                          </p>
                          <InputField
                            type="email"
                            placeholder="Email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2z" /></svg>}
                          />
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 mt-2"
                          >
                            {isLoading ? 'Đang xử lý...' : 'Gửi mã OTP'}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleResetSubmit} className="space-y-4">
                          <p className="text-gray-300 text-center text-sm mb-4">
                            Nhập mã OTP đã được gửi đến email {forgotEmail}
                          </p>
                          <InputField
                            type="text"
                            placeholder="Mã OTP"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                          />
                          <InputField
                            type="password"
                            placeholder="Mật khẩu mới"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                          />
                          <InputField
                            type="password"
                            placeholder="Xác nhận mật khẩu mới"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                          />
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 mt-2"
                          >
                            {isLoading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
                          </button>
                        </form>
                      )}

                      <div className="text-center text-sm text-gray-400 mt-4">
                        <button type="button" onClick={() => setActiveTab('login')} className="text-orange-400 hover:text-orange-300 font-medium">
                          Quay lại đăng nhập
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MaintenancePage;