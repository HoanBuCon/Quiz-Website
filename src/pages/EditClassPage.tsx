import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ClassRoom } from "../types";
import {
  FaSave,
  FaTimes,
  FaShareAlt,
  FaCopy,
  FaShieldAlt,
  FaKey,
  FaUserShield,
  FaHistory,
  FaEdit,
  FaChalkboardTeacher,
  FaGlobe,
  FaLock,
  FaBan,
  FaCheck,
  FaExclamationTriangle,
  FaArrowLeft,
  FaUsers
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import userAvatar from "../assets/user_avatar.gif";

const EditClassPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const stateClass: ClassRoom | undefined = (location.state as any)?.classRoom;

  const [loading, setLoading] = useState(!stateClass);
  const [name, setName] = useState(stateClass?.name || "");
  const [description, setDescription] = useState(stateClass?.description || "");
  const [initialName, setInitialName] = useState(stateClass?.name || "");
  const [initialDescription, setInitialDescription] = useState(stateClass?.description || "");
  const [saving, setSaving] = useState(false);

  const [shareData, setShareData] = useState<{ isShareable: boolean; code?: string } | null>(null);
  const [loadingShare, setLoadingShare] = useState(true);

  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [classPublished, setClassPublished] = useState<boolean>(stateClass?.isPublic || false);
  const [quizRefreshTrigger, setQuizRefreshTrigger] = useState(0);

  // If classRoom not provided via state, fetch from backend (mine)
  useEffect(() => {
    if (!classId) return;
    (async () => {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          toast.error("Vui lòng đăng nhập");
          navigate("/");
          return;
        }
        const { ClassesAPI, VisibilityAPI, QuizzesAPI } = await import("../utils/api");

        // Fetch class info
        // Fetch class info - Always fetch to ensure data is fresh
        const mine = await ClassesAPI.listMine(token);
        const found = mine.find((c: any) => c.id === classId);

        if (found) {
          setName(found.name || "");
          setDescription(found.description || "");
          setInitialName(found.name || "");
          setInitialDescription(found.description || "");
          setClassPublished(found.isPublic || false);
        } else if (!stateClass) {
          toast.error("Không tìm thấy lớp học!");
          navigate(-1);
          return;
        }

        // Fetch quizzes
        const qzs = await QuizzesAPI.byClass(classId, token);
        setQuizzes(qzs);

        // Fetch share status
        const shareStatus = await VisibilityAPI.getShareStatus('class', classId, token);
        setShareData(shareStatus);

      } catch (e) {
        console.error(e);
        toast.error("Không thể tải thông tin lớp học");
      } finally {
        setLoading(false);
        setLoadingShare(false);
      }
    })();
  }, [stateClass, classId, navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên lớp học");
      return;
    }
    setSaving(true);
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { ClassesAPI } = await import("../utils/api");
      await ClassesAPI.update(classId!, { name, description }, token);
      toast.success("Đã cập nhật lớp học thành công!");
      setInitialName(name);
      setInitialDescription(description);
      // navigate(-1); // Optional: stay on page to continue editing
    } catch (e) {
      toast.error("Có lỗi xảy ra khi lưu.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleShare = async () => {
    if (!shareData) return;
    const newState = !shareData.isShareable;
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { VisibilityAPI } = await import("../utils/api");

      await VisibilityAPI.shareToggle({
        targetType: 'class',
        targetId: classId!,
        enabled: newState
      }, token);

      // Refresh status to get code if enabled
      const status = await VisibilityAPI.getShareStatus('class', classId!, token);
      setShareData(status);
      setQuizRefreshTrigger(prev => prev + 1);
      toast.success(newState ? "Đã bật chia sẻ lớp học" : "Đã tắt chia sẻ lớp học");
    } catch (e) {
      toast.error("Không thể thay đổi trạng thái chia sẻ");
    }
  };

  const handleResetCode = async () => {
    if (!window.confirm("CẢNH BÁO: Reset code sẽ làm code cũ bị vô hiệu hóa. Người dùng cũ sẽ không thể truy cập bằng link cũ. Bạn có chắc chắn?")) return;
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { VisibilityAPI } = await import("../utils/api");

      const res = await VisibilityAPI.resetShareCode({
        targetType: 'class',
        targetId: classId!
      }, token);

      setShareData(prev => prev ? ({ ...prev, code: res.code }) : null);
      toast.success("Đã reset code thành công!");
      setQuizRefreshTrigger(prev => prev + 1);
    } catch (e) {
      toast.error("Lỗi khi reset code");
    }
  };

  if (loading) {
    const SpinnerLoading = require("../components/SpinnerLoading").default;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div style={{ transform: 'scale(0.8)' }}>
          <SpinnerLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg md:text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 md:gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Quay lại"
          >
            <FaArrowLeft className="text-gray-600 dark:text-gray-400 text-lg" />
          </button>
          <span>Chỉnh sửa lớp học: <span className="text-blue-600 dark:text-blue-400">{name}</span></span>
        </h1>


      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">

        {/* LEFT COLUMN: General Info & Class Access */}
        <div className="space-y-6">
          {/* Card 1: General Info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg dark:shadow-black/40 border border-gray-100 dark:border-transparent overflow-hidden">
            <div className="bg-blue-700 dark:bg-[#1a1e3a] flex">
              <div className="bg-blue-700 dark:bg-[#1a1e3a] flex items-center justify-center flex-shrink-0 pl-6">
                <FaChalkboardTeacher className="text-blue-200 text-2xl" />
              </div>
              <div className="flex-1 pl-4 pr-6 py-4">
                <h3 className="font-bold text-white dark:text-gray-100">
                  Thông tin chung
                </h3>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Tên lớp học <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none font-medium"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  placeholder="Nhập tên lớp học..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Mô tả <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none resize-y min-h-[100px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={saving}
                  placeholder="Mô tả về lớp học này..."
                />
              </div>
              {(name !== initialName || description !== initialDescription) && (
                <div className="flex justify-end pt-2 animate-fadeIn">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow hover:shadow-md active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {saving ? (
                      <>Running...</>
                    ) : (
                      <>
                        <FaSave /> Lưu thay đổi
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Access Control */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg dark:shadow-black/40 border border-gray-100 dark:border-transparent overflow-hidden">
            <div className="bg-blue-700 dark:bg-[#1a1e3a] flex">
              <div className="bg-blue-700 dark:bg-[#1a1e3a] flex items-center justify-center flex-shrink-0 pl-6">
                <FaShieldAlt className="text-purple-300 text-2xl" />
              </div>
              <div className="flex-1 pl-4 pr-6 py-4">
                <div className="flex md:flex-row flex-col md:justify-between gap-3 md:gap-4">
                  <div className="flex-1 overflow-hidden">
                    <h3 className="font-bold text-white dark:text-gray-100 mb-2 truncate md:overflow-visible md:whitespace-normal">
                      Quản lý quyền truy cập lớp học
                    </h3>
                    {/* Class Info */}
                    <p className="text-xs text-blue-100 dark:text-gray-400">
                      {quizzes.length} bài kiểm tra • {classPublished ? 'Public' : 'Private'}
                    </p>
                  </div>

                  {/* Simple Toggle Switch */}
                  <label className="flex items-center gap-3 cursor-pointer group flex-shrink-0">
                    <span className={`text-sm font-medium transition-colors ${shareData?.isShareable ? 'text-white dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                      {shareData?.isShareable ? 'Đang bật' : 'Đang tắt'}
                    </span>
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={shareData?.isShareable || false} onChange={handleToggleShare} disabled={loadingShare} />
                      <div className={`block w-12 h-7 rounded-full transition-colors duration-300 ${shareData?.isShareable ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                      <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${shareData?.isShareable ? 'transform translate-x-5' : ''}`}></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Share Code Section */}
              <div className={`transition-all duration-500 ease-in-out overflow-hidden ${shareData?.isShareable ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-5 max-[490px]:p-3 border border-blue-100 dark:border-blue-800/30 mb-8">
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider mb-2">
                      CLASS Access ID
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-3 block">
                      Mã truy cập lớp học
                    </p>
                    <div className="flex items-center gap-3 w-full mb-3">
                      <code className="flex-1 px-3 py-2 max-[490px]:px-2 bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 rounded-lg text-xl max-[490px]:text-sm font-mono font-bold text-blue-600 dark:text-blue-400 tracking-wider select-all text-center">
                        {shareData?.code || "WAITING..."}
                      </code>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => {
                          if (shareData?.code) {
                            navigator.clipboard.writeText(shareData.code);
                            toast.success("Đã copy ID!");
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/50 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-xl transition-all duration-200 font-medium text-sm active:scale-95"
                        title="Copy ID"
                      >
                        <FaCopy className="w-4 h-4" /> Copy
                      </button>
                      <button
                        onClick={handleResetCode}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm active:scale-95"
                      >
                        <FaHistory className="w-4 h-4" /> Reset ID
                      </button>
                    </div>
                  </div>
                </div>

                {/* User List Info */}
                <div className="mb-4">
                  <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                    <FaUsers className="text-gray-500" />
                    Danh sách truy cập Class
                  </h4>
                  <UserAccessList classId={classId!} refreshTrigger={quizRefreshTrigger} onRefresh={() => setQuizRefreshTrigger(prev => prev + 1)} />
                </div>
              </div>

              {!shareData?.isShareable && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                  <FaLock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Bật tính năng chia sẻ để quản lý mã truy cập lớp học.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Quiz Access */}
        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          {/* Card 3: Quiz Access Control */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg dark:shadow-black/40 border border-gray-100 dark:border-transparent overflow-hidden lg:max-h-[calc(100vh-120px)]">
            <div className="bg-blue-700 dark:bg-[#1a1e3a] flex">
              <div className="bg-blue-700 dark:bg-[#1a1e3a] flex items-center justify-center flex-shrink-0 pl-6">
                <FaKey className="text-green-300 text-2xl" />
              </div>
              <div className="flex-1 pl-4 pr-6 py-6">
                <h3 className="font-bold text-white dark:text-gray-100">
                  Quản lý quyền truy cập bài kiểm tra
                </h3>
                <p className="text-xs text-blue-100 dark:text-gray-400 mt-1">
                  Cấu hình quyền truy cập cho từng bài kiểm tra
                </p>
              </div>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar lg:max-h-[calc(100vh-240px)]">
              <div className="space-y-4">
                {quizzes.map(q => {
                  return (
                    <QuizAccessCard
                      key={q.id}
                      quiz={q}
                      refreshTrigger={quizRefreshTrigger}
                      onUpdate={() => setQuizRefreshTrigger(prev => prev + 1)}
                    />
                  );
                })}
                {quizzes.length === 0 && (
                  <div className="text-center py-10 text-gray-500">
                    Chưa có bài kiểm tra nào trong lớp học này.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// HELPER COMPONENTS (Styled)
// ----------------------------------------------------------------------

const QuizAccessCard: React.FC<{ quiz: any; onUpdate: () => void; refreshTrigger?: number }> = ({ quiz, onUpdate, refreshTrigger }) => {
  const [shareData, setShareData] = useState<{ isShareable: boolean; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Local token fetch
  const [token, setToken] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    (async () => {
      const { getToken } = await import("../utils/auth");
      setToken(getToken());
    })();
  }, [])

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { VisibilityAPI } = await import("../utils/api");
        const status = await VisibilityAPI.getShareStatus('quiz', quiz.id, token);
        setShareData(status);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [quiz.id, token, refreshTrigger, localRefresh]);

  const handleToggleShare = async () => {
    if (!shareData || !token) return;
    const newState = !shareData.isShareable;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.shareToggle({
        targetType: 'quiz',
        targetId: quiz.id,
        enabled: newState
      }, token);

      const status = await VisibilityAPI.getShareStatus('quiz', quiz.id, token);
      setShareData(status);
      toast.success(newState ? `Đã bật chia sẻ cho quiz: ${quiz.title}` : `Đã tắt chia sẻ cho quiz: ${quiz.title}`);
    } catch (e) {
      toast.error("Không thể thay đổi trạng thái chia sẻ quiz");
    } finally {
      setLoading(false);
    }
  };

  const handleResetCode = async () => {
    if (!token) return;
    if (!window.confirm(`Reset Access ID cho quiz "${quiz.title}"? ID cũ sẽ bị hủy.`)) return;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      const res = await VisibilityAPI.resetShareCode({ targetType: 'quiz', targetId: quiz.id }, token);
      setShareData(prev => prev ? ({ ...prev, code: res.code }) : null);
      toast.success("Đã reset Quiz Access ID!");
      setLocalRefresh(prev => prev + 1);
      if (onUpdate) onUpdate();
    } catch (e) {
      toast.error("Lỗi khi reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl overflow-hidden transition-all duration-300 ${expanded ? 'shadow-[0_0_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_20px_rgba(255,255,255,0.15)] border border-gray-200 dark:border-gray-700' : 'shadow-sm border border-gray-200 dark:border-gray-700'}`}>
      {/* Header */}
      <div
        className={`px-6 py-4 max-[490px]:p-4 cursor-pointer transition-colors ${expanded ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-100/50 dark:hover:bg-gray-700/50'}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex md:flex-row flex-col md:items-center items-start justify-between gap-3">
          {/* Quiz Info Section */}
          <div className="flex items-center gap-3 flex-1 min-w-0 md:flex-1 w-full md:w-auto">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${quiz.published ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
              {quiz.published ? <FaGlobe /> : <FaLock />}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">
                {quiz.title}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                {quiz.questionCount ?? 0} câu hỏi • {quiz.published ? "Public" : "Private"}
              </p>
            </div>
          </div>

          {/* Toggle and Arrow Section - Desktop */}
          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            {/* Toggle Switch */}
            <label className="flex items-center gap-2 cursor-pointer group" onClick={(e) => e.stopPropagation()}>
              <span className={`text-xs font-medium transition-colors ${shareData?.isShareable ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
                {shareData?.isShareable ? 'Đang bật' : 'Đang tắt'}
              </span>
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={shareData?.isShareable || false} onChange={handleToggleShare} disabled={loading} />
                <div className={`block w-10 h-6 rounded-full transition-colors duration-300 ${shareData?.isShareable ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                <div className={`absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${shareData?.isShareable ? 'transform translate-x-4' : ''}`}></div>
              </div>
            </label>

            <button className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-md transition-colors duration-200 ${expanded ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Mobile Controls - Full Width Row */}
          <div className="md:hidden w-full flex items-center justify-between">
            {/* Toggle Switch - Right */}
            <label className="flex items-center gap-2 cursor-pointer group ml-auto" onClick={(e) => e.stopPropagation()}>
              <span className={`text-xs font-medium transition-colors ${shareData?.isShareable ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
                {shareData?.isShareable ? 'Đang bật' : 'Đang tắt'}
              </span>
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={shareData?.isShareable || false} onChange={handleToggleShare} disabled={loading} />
                <div className={`block w-10 h-6 rounded-full transition-colors duration-300 ${shareData?.isShareable ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                <div className={`absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${shareData?.isShareable ? 'transform translate-x-4' : ''}`}></div>
              </div>
            </label>

            {/* Arrow Button - Center (absolute) */}
            <button className={`absolute left-1/2 -translate-x-1/2 text-xs font-medium w-6 h-6 flex items-center justify-center rounded-md transition-colors duration-200 ${expanded ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-6 border-t border-gray-100 dark:border-gray-700">
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${shareData?.isShareable ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
            {/* Code Display Section - Similar to Class */}
            <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-5 max-[490px]:p-3 border border-green-100 dark:border-green-800/30 mb-6">
              <div className="flex-1 w-full">
                <h4 className="text-sm font-bold text-green-800 dark:text-green-300 uppercase tracking-wider mb-2">
                  Quiz Access ID
                </h4>
                <p className="text-sm text-green-700 dark:text-green-400 mb-3">
                  Mã truy cập riêng cho Quiz
                </p>
                <div className="flex items-center gap-3 w-full mb-3">
                  <code className="flex-1 px-3 py-2 max-[490px]:px-2 bg-white dark:bg-gray-800 border-2 border-green-200 dark:border-green-700 rounded-lg text-xl max-[490px]:text-sm font-mono font-bold text-green-600 dark:text-green-400 tracking-wider select-all text-center">
                    {shareData?.code || "WAITING..."}
                  </code>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => {
                      if (shareData?.code) {
                        navigator.clipboard.writeText(shareData.code);
                        toast.success("Đã copy Quiz ID!");
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-green-100 hover:bg-green-200 dark:bg-green-800/50 dark:hover:bg-green-800 text-green-600 dark:text-green-300 rounded-xl transition-all duration-200 font-medium text-sm active:scale-95"
                    title="Copy ID"
                  >
                    <FaCopy className="w-4 h-4" /> Copy
                  </button>
                  <button
                    onClick={handleResetCode}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <FaHistory className="w-4 h-4" /> Reset ID
                  </button>
                </div>
              </div>
            </div>

            {/* User List */}
            <div>
              <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                <FaUsers className="text-gray-500" />
                Danh sách truy cập Quiz
              </h4>
              <UserAccessList classId={quiz.id} targetType="quiz" refreshTrigger={(refreshTrigger || 0) + localRefresh} />
            </div>
          </div>

          {!shareData?.isShareable && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
              <FaLock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Bật tính năng chia sẻ để quản lý mã truy cập bài kiểm tra.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UserAccessList: React.FC<{ classId: string; targetType?: 'class' | 'quiz'; onRefresh?: () => void; refreshTrigger?: number }> = ({ classId, targetType = 'class', onRefresh, refreshTrigger }) => {
  const [users, setUsers] = useState<{ active: any[]; banned: any[] }>({ active: [], banned: [] });
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { getToken } = await import("../utils/auth");
      setToken(getToken());
    })();
  }, []);

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      const data = await VisibilityAPI.getAccessUsers(targetType, classId, token);
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchUsers();
  }, [classId, targetType, token, refreshTrigger]);

  const handleBan = async (userId: string) => {
    if (!token) return;
    if (!window.confirm("Bạn có chắc muốn chặn người dùng này?")) return;
    try {
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.banUser({ targetType, targetId: classId, userId }, token);
      toast.success("Đã chặn người dùng");
      fetchUsers();
      if (targetType === 'class' && onRefresh) onRefresh();
    } catch (e) {
      toast.error("Lỗi khi ban user");
    }
  };

  const handleUnban = async (userId: string) => {
    if (!token) return;
    if (!window.confirm("Bỏ chặn người dùng này?")) return;
    try {
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.unbanUser({ targetType, targetId: classId, userId }, token);
      toast.success("Đã bỏ chặn");
      fetchUsers();
      if (targetType === 'class' && onRefresh) onRefresh();
    } catch (e) {
      toast.error("Lỗi khi unban user");
    }
  };

  return (
    <div className="space-y-5">
      {/* Active Users */}
      <div>
        <h4 className="font-semibold text-xs mb-3 text-green-600 dark:text-green-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Active Users ({users.active.length})
        </h4>

        {loading && users.active.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-2">Loading...</div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="md:hidden space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {users.active.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-400 italic bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl">Chưa có người dùng nào truy cập.</div>
              ) : (
                users.active.map(u => (
                  <div key={u.userId} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl p-4 max-[490px]:p-2 flex items-center justify-between gap-3 max-[490px]:gap-2">
                    <div className="flex items-center gap-3 max-[490px]:gap-2 overflow-hidden">
                      <img
                        src={u.avatarUrl || userAvatar}
                        alt=""
                        className="w-10 h-10 max-[490px]:w-8 max-[490px]:h-8 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0 cursor-pointer"
                        onClick={() => window.open(u.avatarUrl || userAvatar, '_blank')}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = userAvatar;
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate max-[490px]:text-xs">{u.name}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleBan(u.userId)}
                      className="p-2 max-[490px]:p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors border border-red-200 dark:border-red-800 flex-shrink-0"
                      title="Ban User"
                    >
                      <FaBan />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {users.active.length === 0 ? (
                  <div className="text-center py-4 text-xs text-gray-400 italic">Chưa có người dùng nào truy cập.</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold shadow-sm">
                      <tr>
                        <th className="py-4 px-6">User</th>
                        <th className="py-4 px-6 text-right">Action</th>
                      </tr>
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
                    </thead>
                    <tbody>
                      {users.active.map(u => (
                        <tr key={u.userId} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors duration-200 relative gradient-row-divider">
                          <td className="py-4 px-6 align-middle">
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatarUrl || userAvatar}
                                alt=""
                                className="w-10 h-10 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0 cursor-pointer"
                                onClick={() => window.open(u.avatarUrl || userAvatar, '_blank')}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = userAvatar;
                                }}
                              />
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">{u.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 align-middle text-right">
                            <button
                              onClick={() => handleBan(u.userId)}
                              className="flex items-center gap-1.5 px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-all duration-200 text-xs font-medium border border-red-200 dark:border-red-800 active:scale-95 ml-auto"
                              title="Ban User"
                            >
                              <FaBan /> Ban
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Banned Users */}
      {users.banned.length > 0 && (
        <div className="animate-fadeIn">
          <h4 className="font-semibold text-xs mb-3 text-red-500 dark:text-red-400 uppercase tracking-wider flex items-center gap-2">
            <FaExclamationTriangle />
            Banned Users ({users.banned.length})
          </h4>
          <>
            {/* Mobile View */}
            <div className="md:hidden space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {users.banned.map(u => (
                <div key={u.userId} className="bg-red-50/30 dark:bg-red-900/10 border border-gray-100 dark:border-gray-700/50 rounded-xl p-4 max-[490px]:p-2 flex items-center justify-between gap-3 max-[490px]:gap-2">
                  <div className="flex items-center gap-3 max-[490px]:gap-2 overflow-hidden">
                    <img
                      src={u.avatarUrl || userAvatar}
                      alt=""
                      className="w-10 h-10 max-[490px]:w-8 max-[490px]:h-8 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0 cursor-pointer"
                      onClick={() => window.open(u.avatarUrl || userAvatar, '_blank')}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = userAvatar;
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-red-600 dark:text-red-400 truncate max-[490px]:text-xs">{u.name}</span>
                        {u.source === 'class' && (
                          <span className="inline-flex items-center gap-1 text-[10px] max-[490px]:text-[8px] text-amber-600 dark:text-amber-500 font-bold">
                            <FaExclamationTriangle className="text-[10px] max-[490px]:text-[8px]" /> CLASS BAN
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnban(u.userId)}
                    disabled={targetType === 'quiz' && u.source === 'class'}
                    className={`p-2 max-[490px]:p-1.5 rounded-lg transition-colors border flex-shrink-0 ${targetType === 'quiz' && u.source === 'class'
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700'
                      : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30'
                      }`}
                  >
                    <FaCheck />
                  </button>
                </div>
              ))}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold shadow-sm">
                    <tr>
                      <th className="py-4 px-6">User</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
                  </thead>
                  <tbody>
                    {users.banned.map(u => (
                      <tr key={u.userId} className="hover:bg-red-50/30 dark:hover:bg-red-900/10 transition-colors duration-200 relative gradient-row-divider">
                        <td className="py-4 px-6 align-middle">
                          <div className="flex items-center gap-3">
                            <img
                              src={u.avatarUrl || userAvatar}
                              alt=""
                              className="w-10 h-10 rounded-full shadow-sm border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0 cursor-pointer"
                              onClick={() => window.open(u.avatarUrl || userAvatar, '_blank')}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = userAvatar;
                              }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-red-600 dark:text-red-400">{u.name}</span>
                                {u.source === 'class' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500 font-bold ml-1">
                                    <FaExclamationTriangle className="text-[10px]" /> CLASS BAN
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 align-middle text-right">
                          <button
                            onClick={() => handleUnban(u.userId)}
                            disabled={targetType === 'quiz' && u.source === 'class'}
                            title={targetType === 'quiz' && u.source === 'class' ? 'Cần Unban người dùng trong Class' : 'Bỏ chặn người dùng này'}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-200 text-xs font-medium border active:scale-95 ml-auto ${targetType === 'quiz' && u.source === 'class'
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700'
                              : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30'
                              }`}
                          >
                            <FaCheck style={{ fontSize: '14px', width: '14px', height: '14px', display: 'inline-block' }} /> Unban
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        </div>
      )}
    </div>
  );
};

export default EditClassPage;
