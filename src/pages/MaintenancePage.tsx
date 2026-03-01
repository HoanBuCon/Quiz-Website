import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MAINTENANCE_MESSAGE, MAINTENANCE_VIDEO_URL, IS_MAINTENANCE_MODE } from '../utils/maintenanceConfig';
import { checkAuth } from '../utils/auth';
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

const RandomChar = React.memo(({ speed }: { speed: number }) => {
  const [char, setChar] = useState('0');

  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const interval = setInterval(() => {
      setChar(chars[Math.floor(Math.random() * chars.length)]);
    }, speed);
    return () => clearInterval(interval);
  }, [speed]);

  return <>{char}</>;
});

const MaintenancePage: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const navigate = useNavigate();
  const { enterWebsite } = useData();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('start');

  // Form States
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false); // Remember me checkbox state

  // Forgot Password States
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [isProcessStarting, setIsProcessStarting] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isExiting, setIsExiting] = useState(false);

  // Typewriter effect states
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [triggerShieldScan, setTriggerShieldScan] = useState(0);

  // Generate particles configuration once and memoize it
  const particles = useMemo(() => {
    return Array.from({ length: 36 }, (_, i) => {
      const size = Math.random() * 2 + 2; // 2-4px (small square)
      // Distribute particles more evenly across the width
      const basePosition = (i / 36) * 100; // Divide into 36 sections
      const randomOffset = (Math.random() - 0.5) * 10; // Random offset ±5%
      const startX = Math.max(0, Math.min(100, basePosition + randomOffset));

      // Random visual properties
      const opacity = 0.3 + Math.random() * 0.5; // 0.3-0.8
      const glowIntensity = 4 + Math.random() * 8; // 4-12px glow
      const brightness = 0.6 + Math.random() * 0.4; // 0.6-1.0

      return {
        size,
        startX,
        duration: 2 + Math.random() * 1.5, // 2-3.5s (faster for more density)
        delay: Math.random() * 2, // 0-2s (shorter delay for more density)
        opacity,
        glowIntensity,
        brightness,
      };
    });
  }, []); // Empty dependency array - only calculate once

  useEffect(() => {
    // Check authentication status with cookie-based auth
    const initAuth = async () => {
      const isAuth = await checkAuth();
      setIsLoggedIn(isAuth);
      if (isAuth) {
        setActiveTab('start');
        try {
          // Token is in httpOnly cookie, no need to pass it
          const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
          const res = await fetch(`${API_URL}/auth/me`, {
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            setCurrentUser(data.user);
          }
        } catch { }
      } else {
        setActiveTab('login');
      }
    };
    initAuth();
  }, []);

  // Listen for auth changes (e.g., logout from Header/Sidebar)
  useEffect(() => {
    const handleAuthChange = async () => {
      const isAuth = await checkAuth();
      setIsLoggedIn(isAuth);
      if (!isAuth) {
        setActiveTab('login');
        setCurrentUser(null);
      }
    };

    window.addEventListener('authChange', handleAuthChange);
    return () => window.removeEventListener('authChange', handleAuthChange);
  }, []);

  // Typewriter effect
  useEffect(() => {
    if (activeTab === 'start' && currentUser?.name && isPlaying) {
      const fullText = `Xin chào ${currentUser.name}!`;
      let currentIndex = 0;
      setDisplayedText(''); // Reset text
      setIsTyping(true);

      const typingInterval = setInterval(() => {
        if (currentIndex <= fullText.length) {
          setDisplayedText(fullText.slice(0, currentIndex));
          currentIndex++;
        } else {
          setIsTyping(false);
          clearInterval(typingInterval);
        }
      }, 80); // 80ms per character

      return () => clearInterval(typingInterval);
    }
  }, [activeTab, currentUser, isPlaying]);

  // Cursor blinking effect
  useEffect(() => {
    if (isTyping) {
      setShowCursor(true);
      return;
    }

    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530); // Blink every 530ms

    return () => clearInterval(cursorInterval);
  }, [isTyping]);

  // Shield scan effect - trigger every 5 seconds
  useEffect(() => {
    const scanInterval = setInterval(() => {
      setTriggerShieldScan(prev => prev + 1);
    }, 5000); // Every 5 seconds

    return () => clearInterval(scanInterval);
  }, []);

  // Shield scan effect - trigger every 5 seconds
  useEffect(() => {
    const scanInterval = setInterval(() => {
      setTriggerShieldScan(prev => prev + 1);
    }, 5000); // Every 5 seconds

    return () => clearInterval(scanInterval);
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
        setTimeout(async () => {
          setIsProcessStarting(false);
          setIsPlaying(true); // Chuyển sang màn hình chính

          // Logic check authentication
          if (IS_MAINTENANCE_MODE) {
            setShowMaintenance(true);
          } else {
            const isAuth = await checkAuth();
            if (isAuth) {
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

    // Lưu thời gian hiện tại của video để HomePage phát tiếp diễn
    if (videoRef.current) {
      sessionStorage.setItem('bannerVideoTime', String(videoRef.current.currentTime));
    }

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
      const response = await AuthAPI.login(email, password, rememberMe);
      // Cookie is automatically set by server
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
        animation: warpOut 0.8s ease-in-out forwards;
      }
      @keyframes warpOut {
        0% { opacity: 1; transform: scale(1); filter: blur(0px); }
        100% { opacity: 0; transform: scale(2); filter: blur(10px); }
      }
      /* Typewriter Effect */
      .typewriter-text {
        font-family: 'Consolas', 'Courier New', monospace;
        display: inline;
        word-wrap: break-word;
        overflow-wrap: break-word;
        white-space: pre-wrap;
        line-height: 1.5;
        text-shadow: 
          0 0 7px rgba(0, 255, 255, 0.75),
          0 0 10px rgba(0, 255, 255, 0.50),
          0 0 15px rgba(0, 255, 255, 0.25);
      }
      .typewriter-cursor {
        display: inline;
        color: currentColor;
        margin-left: 2px;
        font-weight: bold;
        text-shadow: 
          0 0 7px rgba(0, 255, 255, 0.75),
          0 0 10px rgba(0, 255, 255, 0.50);
        animation: none;
      }
      .typewriter-cursor.blink {
        opacity: 1;
      }
      .typewriter-cursor.hidden {
        opacity: 0;
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
        className={`absolute top-0 left-0 w-full h-full object-cover ${isExiting ? "exit-animation" : ""}`}
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
                  transition-transform duration-[1000ms] ease-out
                  bg-gradient-to-r from-transparent via-white/10 to-transparent
                  blur-[1px] opacity-35
                "
                style={{ zIndex: 1 }}
              />
            </button>
          </div>
        )}

        {/* CASE 2: THANH LOADING (Đang chạy 5s) - REFINED TECH & ELEGANT */}
        {isProcessStarting && (
          <div className="w-full max-w-xl px-8 animate-fadeIn relative z-20">
            {/* Tech Header Info */}
            <div className="flex justify-between items-end mb-3 font-mono text-xs tracking-wider">
              <div className="flex items-center gap-2 text-orange-400/80">
                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping" />
                <span>SYSTEM INITIALIZATION</span>
              </div>
              <span className="text-orange-400 font-semibold">{Math.round(loadingProgress)}%</span>
            </div>

            {/* Progress Track */}
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-visible relative">
              {/* Glow Container */}
              <div className="absolute -inset-1 bg-orange-500/10 blur-md rounded-full" />

              {/* Main Progress Bar with Segmented Look */}
              <div
                className="relative h-full bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-400 rounded-full transition-all duration-75 ease-linear overflow-hidden"
                style={{ width: `${loadingProgress}%` }}
              >
                {/* Scanline/Shimmer Effect */}
                <div className="absolute inset-0 w-full h-full bg-white/20 animate-scanline" />

                {/* Segmented Mask Overlay for Tech Feel */}
                <div
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
                  }}
                />
              </div>

              {/* Leading Head Glow (Follows the bar) */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3 w-1 bg-white blur-[2px] rounded-full z-10 transition-all duration-75 ease-linear"
                style={{ left: `${loadingProgress}%`, opacity: loadingProgress > 0 ? 1 : 0 }}
              />
            </div>

            {/* Footer Status Text */}
            <div className="mt-4 flex justify-between items-center text-[10px] font-mono text-gray-400 uppercase tracking-widest max-[400px]:flex-col max-[400px]:gap-1">
              <span>ID: {[600, 250, 100, 600, 40, 100, 40, 100, 250, 40].map((speed, i) => (
                <RandomChar key={i} speed={speed} />
              ))}
              </span>
              <span className="animate-pulse">
                {loadingProgress < 30 ? "Kết nối đến máy chủ vệ tinh..." :
                  loadingProgress < 60 ? "Tải gói tài nguyên..." :
                    loadingProgress < 90 ? "Đồng bộ dữ liệu..." :
                      "Sẵn sàng"}
              </span>
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
                      <div className="flex justify-center my-6">
                        <h3 className="font-mono text-white max-w-md" style={{ fontSize: '24px' }}>
                          <span className="typewriter-text">
                            {displayedText}
                          </span>
                          <span className={`typewriter-cursor ${showCursor ? 'blink' : 'hidden'}`}>|</span>
                        </h3>
                      </div>
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

                        {/* Soft Wave Shimmer - Hover only */}
                        <div
                          className="
                            absolute inset-0 rounded-lg overflow-hidden
                            -translate-x-full group-hover:translate-x-full
                            transition-transform duration-[1000ms] ease-out
                          "
                          style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(0, 255, 255, 0.025) 15%, rgba(0, 255, 255, 0.042) 30%, rgba(0, 255, 255, 0.07) 40%, rgba(0, 255, 255, 0.077) 50%, rgba(0, 255, 255, 0.07) 60%, rgba(0, 255, 255, 0.049) 70%, rgba(0, 255, 255, 0.025) 85%, transparent 100%)',
                          }}
                        />

                        {/* Hexagonal grid overlay for shimmer */}
                        <div
                          className="
                            absolute inset-0 rounded-lg overflow-hidden
                            -translate-x-full group-hover:translate-x-full
                            transition-transform duration-[1000ms] ease-out
                          "
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='49' viewBox='0 0 28 49' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z' fill='%2300ffff' fill-opacity='0.042' fill-rule='evenodd'/%3E%3C/svg%3E")`,
                            backgroundSize: '35px 61px',
                            maskImage: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 3%, rgba(255, 255, 255, 0.8) 20%, white 50%, rgba(255, 255, 255, 0.8) 80%, rgba(255, 255, 255, 0.3) 97%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 3%, rgba(255, 255, 255, 0.8) 20%, white 50%, rgba(255, 255, 255, 0.8) 80%, rgba(255, 255, 255, 0.3) 97%, transparent 100%)',
                          }}
                        />

                        {/* Hover Glow Border */}
                        <div
                          className="
                            absolute inset-0 rounded-lg 
                            group-hover:shadow-[0_0_15px_3px_rgb(0,255,255,0.55)]
                            transition-all duration-300
                          "
                        />

                        {/* Shield Scan Effect - DISABLED
                        <div
                          key={triggerShieldScan}
                          className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none"
                        >
                          <div
                            className="absolute inset-y-0 left-0 right-0"
                            style={{
                              background: 'linear-gradient(90deg, transparent 0%, rgba(0, 255, 255, 0.08) 25%, rgba(0, 255, 255, 0.15) 40%, rgba(0, 255, 255, 0.2) 48%, rgba(0, 255, 255, 0.25) 50%, rgba(0, 255, 255, 0.2) 52%, rgba(0, 255, 255, 0.15) 60%, rgba(0, 255, 255, 0.08) 75%, transparent 100%)',
                              animation: 'shieldScan 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                            }}
                          />
                          <div
                            className="absolute inset-0"
                            style={{
                              backgroundImage: `
                                repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(0, 255, 255, 0.08) 8px, rgba(0, 255, 255, 0.08) 9px),
                                repeating-linear-gradient(60deg, transparent, transparent 8px, rgba(0, 255, 255, 0.08) 8px, rgba(0, 255, 255, 0.08) 9px),
                                repeating-linear-gradient(120deg, transparent, transparent 8px, rgba(0, 255, 255, 0.08) 8px, rgba(0, 255, 255, 0.08) 9px)
                              `,
                              backgroundSize: '10px 10px',
                              maskImage: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 20%, rgba(255, 255, 255, 0.8) 35%, white 50%, rgba(255, 255, 255, 0.8) 65%, rgba(255, 255, 255, 0.3) 80%, transparent 100%)',
                              WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 20%, rgba(255, 255, 255, 0.8) 35%, white 50%, rgba(255, 255, 255, 0.8) 65%, rgba(255, 255, 255, 0.3) 80%, transparent 100%)',
                              animation: 'shieldScan 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                            }}
                          />
                        </div>
                        */}

                        {/* Particle Layer */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          {particles.map((particle, i) => (
                            <div
                              key={i}
                              className="absolute animate-particleFloat"
                              style={{
                                width: `${particle.size}px`,
                                height: `${particle.size}px`,
                                left: `${particle.startX}%`,
                                bottom: `-20px`,
                                animationDelay: `${particle.delay}s`,
                                animationDuration: `${particle.duration}s`,
                                backgroundColor: `rgba(0, 255, 255, ${particle.opacity * particle.brightness})`,
                                boxShadow: `0 0 ${particle.glowIntensity}px rgba(0, 255, 255, ${particle.opacity * 0.8}), inset 0 0 ${particle.glowIntensity * 0.5}px rgba(0, 255, 255, ${particle.opacity * 0.4})`,
                                border: `1px solid rgba(0, 255, 255, ${particle.opacity * 0.5})`,
                                opacity: particle.opacity,
                              }}
                            />
                          ))}
                        </div>

                        {/* Text */}
                        <div className="relative inline-block start-glitch-wrapper">
                          <span className="relative z-10 font-mono text-xl tracking-[0.25em]">
                            START
                          </span>
                          <span className="font-mono text-xl tracking-[0.25em] start-glitch-layer start-glitch-layer-1" aria-hidden="true">
                            START
                          </span>
                          <span className="font-mono text-xl tracking-[0.25em] start-glitch-layer start-glitch-layer-2" aria-hidden="true">
                            START
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={async () => {
                          // Call logout API to clear cookie
                          try {
                            const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';
                            await fetch(`${API_URL}/auth/logout`, {
                              method: 'POST',
                              credentials: 'include'
                            });
                          } catch { }
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
                      <h3 className="text-xl font-jetbrains text-white text-center mb-6">Đăng nhập</h3>

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

                      <div className="flex items-center justify-between">
                        {/* Remember Me Checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            tabIndex={-1}
                            className="w-4 h-4 rounded border border-white/10 bg-white/5 checked:bg-orange-500 checked:border-orange-500 appearance-none cursor-pointer transition-all hover:border-orange-500 hover:outline hover:outline-1 hover:outline-orange-500/50 focus:ring-0 focus:ring-offset-0 relative"
                            style={{ backgroundImage: rememberMe ? `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")` : 'none', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: '100%' }}
                          />
                          <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                            Lưu đăng nhập
                          </span>
                        </label>

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
                      <h3 className="text-xl font-jetbrains text-white text-center mb-6">Đăng ký</h3>

                      <InputField
                        type="text"
                        placeholder="Tên tài khoản"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        maxLength={30}
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
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
                        icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
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
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>}
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
                            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
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