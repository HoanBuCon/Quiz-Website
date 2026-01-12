import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { MusicProvider } from "./context/MusicContext";
import { DataProvider, useData } from "./context/DataContext";
import Layout from "./components/Layout/Layout";
import SidebarLayout from "./components/Layout/SidebarLayout";
import BackgroundMusic from "./components/BackgroundMusic";
import HomePage from "./pages/HomePage";
import ClassesPage from "./pages/ClassesPage";
import CreateClassPage from "./pages/CreateClassPage";
import EditQuizPage from "./pages/EditQuizPage";
import EditClassPage from "./pages/EditClassPage";
import DocumentsPage from "./pages/DocumentsPage";
import DocumentViewerPage from "./pages/DocumentViewerPage";
import QuizPage from "./pages/QuizPage";
import ResultsPage from "./pages/ResultsPage";
import ClassViewPage from "./pages/ClassViewPage";
import ProfilePage from "./pages/ProfilePage";
import MaintenancePage from "./pages/MaintenancePage";
import { getToken } from "./utils/auth";
import { getApiBaseUrl } from "./utils/api";
import { IS_MAINTENANCE_MODE, canBypassMaintenance } from "./utils/maintenanceConfig";

// ThemedToaster component để đổi màu theo theme
function ThemedToaster() {
  const { isDarkMode } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      reverseOrder={false}
      gutter={8}
      containerClassName=""
      containerStyle={{ bottom: "20px" }}
      toastOptions={{
        className: "",
        duration: 4000,
        style: isDarkMode
          ? {
            background:
              "linear-gradient(135deg, rgba(45, 55, 72, 0.95), rgba(26, 32, 44, 0.95))",
            color: "#f7fafc",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "13px",
            fontWeight: "500",
            boxShadow: "0 8px 20px rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(116, 129, 140, 0.3)",
            minWidth: "200px",
            maxWidth: "400px",
            whiteSpace: "nowrap" as const,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }
          : {
            background: "linear-gradient(135deg, #fff, #f3f4f6)",
            color: "#222",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "13px",
            fontWeight: "500",
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
            backdropFilter: "blur(10px)",
            border: "1px solid #e5e7eb",
            minWidth: "200px",
            maxWidth: "400px",
            whiteSpace: "nowrap" as const,
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        success: {
          duration: 3000,
          iconTheme: {
            primary: isDarkMode ? "#10b981" : "#059669",
            secondary: "#fff",
          },
          style: isDarkMode
            ? {
              background:
                "linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.9))",
              color: "#fff",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: "500",
              boxShadow: "0 8px 20px rgba(16, 185, 129, 0.3)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              minWidth: "200px",
              maxWidth: "400px",
              whiteSpace: "nowrap" as const,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }
            : {
              background: "linear-gradient(135deg, #6ee7b7, #a7f3d0)",
              color: "#065f46",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: "500",
              boxShadow: "0 8px 20px rgba(16, 185, 129, 0.08)",
              backdropFilter: "blur(10px)",
              border: "1px solid #6ee7b7",
              minWidth: "200px",
              maxWidth: "400px",
              whiteSpace: "nowrap" as const,
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: isDarkMode ? "#f87171" : "#ef4444",
            secondary: "#fff",
          },
          style: isDarkMode
            ? {
              background:
                "linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9))",
              color: "#fff",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: "500",
              boxShadow: "0 8px 20px rgba(239, 68, 68, 0.3)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              minWidth: "200px",
              maxWidth: "400px",
              whiteSpace: "nowrap" as const,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }
            : {
              background: "linear-gradient(135deg, #fca5a5, #fecaca)",
              color: "#991b1b",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              fontWeight: "500",
              boxShadow: "0 8px 20px rgba(239, 68, 68, 0.08)",
              backdropFilter: "blur(10px)",
              border: "1px solid #fca5a5",
              minWidth: "200px",
              maxWidth: "400px",
              whiteSpace: "nowrap" as const,
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
        },
      }}
    />
  );
}

// Component để bảo vệ các route
const MaintenanceGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasEntered } = useData();
  const location = useLocation();

  // 1. Kiểm tra chế độ bảo trì
  if (IS_MAINTENANCE_MODE && !canBypassMaintenance()) {
    // Nếu đang ở trang Welcome thì giữ nguyên
    if (location.pathname === "/welcome") {
      return <>{children}</>;
    }
    // Nếu không thì redirect về maintenance
    return <Navigate to="/welcome" replace />;
  }

  // 2. Chế độ bình thường (Landing Mode)

  // Nếu đang ở trang Welcome -> Luôn cho phép
  if (location.pathname === "/welcome") {
    return <>{children}</>;
  }

  // Các route public khác (Forgot Password) -> Cho phép truy cập
  if (location.pathname === '/forgot-password') {
    return <>{children}</>;
  }

  // Các route protected (Home, Classes, etc.)
  // Nếu chưa "Enter" (chưa bấm Start từ Welcome Page) -> Redirect về maintenance
  if (!hasEntered) {
    return <Navigate to="/welcome" replace />;
  }

  // Nếu đã Enter -> Cho phép truy cập
  return <>{children}</>;
};

function App() {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const token = getToken();
        if (navigator.sendBeacon && token) {
          const url = `${getApiBaseUrl()}/auth/offline-signal?token=${encodeURIComponent(token)}`;
          navigator.sendBeacon(url);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Log trạng thái bảo trì khi app khởi động (chỉ trong development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // console.log(
      //   `%MAINTENANCE MODE: ${IS_MAINTENANCE_MODE ? 'ON' : 'OFF'}`,
      //   `font-size: 14px; font-weight: bold; color: ${IS_MAINTENANCE_MODE ? '#ef4444' : '#10b981'}`
      // );
      if (IS_MAINTENANCE_MODE) {
        // console.log(
        //   '%To bypass maintenance, run: window.setMaintenanceBypass()',
        //   'font-size: 12px; color: #3b82f6'
        // );
      }
    }
  }, []);

  return (
    <ThemeProvider>
      <MusicProvider>
        <DataProvider>
          <Router>
            <Routes>
              {/* Trang bảo trì / Landing Page */}
              <Route
                path="/welcome"
                element={
                  <MaintenanceGuard>
                    <MaintenancePage />
                  </MaintenanceGuard>
                }
              />

              {/* Tất cả các route khác đều được bảo vệ bởi MaintenanceGuard */}
              <Route
                path="/"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout noPadding={true}>
                      <HomePage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/classes"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout noPadding={true}>
                      <ClassesPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/profile"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout noPadding={true}>
                      <ProfilePage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/create"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout noPadding={true}>
                      <CreateClassPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/edit-quiz"
                element={
                  <MaintenanceGuard>
                    <Layout>
                      <EditQuizPage />
                    </Layout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/documents"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout noPadding={true}>
                      <DocumentsPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/document/:id"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout>
                      <DocumentViewerPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/quiz/:quizId"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout>
                      <QuizPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/results/:quizId"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout>
                      <ResultsPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
              <Route
                path="/class/:classId"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout>
                      <ClassViewPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />

              {/* Route với FixedLayout -> Chuyển sang SidebarLayout */}
              <Route
                path="/edit-class/:classId"
                element={
                  <MaintenanceGuard>
                    <SidebarLayout>
                      <EditClassPage />
                    </SidebarLayout>
                  </MaintenanceGuard>
                }
              />
            </Routes>

            {/* Background Music Player - Chỉ hiện khi KHÔNG bảo trì VÀ KHÔNG ở trang Welcome */}
            <RenderMusicPlayer />

            {/* Toast notifications */}
            <ThemedToaster />
          </Router>
        </DataProvider>
      </MusicProvider>
    </ThemeProvider>
  );
}

// Helper component để check location cho Music Player
const RenderMusicPlayer = () => {
  const location = useLocation();
  // Chỉ hiện nhạc khi không phải mode bảo trì VÀ không ở trang /welcome
  if (IS_MAINTENANCE_MODE || location.pathname === '/welcome') {
    return null;
  }
  return <BackgroundMusic />;
};

export default App;
