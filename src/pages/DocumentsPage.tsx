import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UploadedFile } from "../types";
import { parseFile } from "../utils/docsParser";
import {
  checkDuplicateFileName,
  showDuplicateModal,
  formatDate,
} from "../utils/fileUtils";
import { useTheme } from "../context/ThemeContext";

const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [documents, setDocuments] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalQuizzes, setTotalQuizzes] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // ... mouse handlers ...
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    setMousePosition({ x: mouseX, y: mouseY });
  };

  const handleMouseLeave = () => {
    setMousePosition({ x: 0, y: 0 });
  };

  // Modal states
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [isCreateNewClass, setIsCreateNewClass] = useState(true);
  const [className, setClassName] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [existingClasses, setExistingClasses] = useState<any[]>([]);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === documents.length && documents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)));
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) return;

    const selectedDocs = documents.filter(d => selectedIds.has(d.id));

    // Process sequentially to be nice to the browser/server
    for (const doc of selectedDocs) {
      await handleDownload(doc);
      // Small delay to prevent browser blocking visible downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.size} tài liệu đang chọn?`)) {
      return;
    }

    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;

      const { DocumentsAPI } = await import("../utils/api");

      let successCount = 0;
      const errors: string[] = [];

      // Execute deletions
      await Promise.all(Array.from(selectedIds).map(async (id) => {
        try {
          await DocumentsAPI.remove(id, token);
          successCount++;
        } catch (e) {
          errors.push(id);
        }
      }));

      // Update local state
      setDocuments(prev => prev.filter(d => !selectedIds.has(d.id)));
      setSelectedIds(new Set());

      if (successCount > 0) {
        alert(`Đã xóa thành công ${successCount} tài liệu!`);
      }
      if (errors.length > 0) {
        console.error("Failed to delete some files:", errors);
        alert(`Có ${errors.length} tài liệu không xóa được.`);
      }

    } catch (e) {
      console.error("Bulk delete failed:", e);
      alert("Có lỗi xảy ra khi xóa tài liệu.");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".custom-class-dropdown")) {
        setIsClassDropdownOpen(false);
      }
    };
    if (isClassDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isClassDropdownOpen]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();

      if (!token) {
        setDocuments([]);
        setTotalClasses(0);
        setTotalQuizzes(0);
        setExistingClasses([]);
        setLoading(false);
        return;
      }

      const { DocumentsAPI, ClassesAPI, QuizzesAPI } = await import(
        "../utils/api"
      );

      // Load documents
      const files = await DocumentsAPI.listMine(token);
      setDocuments(
        files.map((f: any) => ({ ...f, uploadedAt: new Date(f.uploadedAt) }))
      );

      // Load classes and quizzes stats
      const mine = await ClassesAPI.listMine(token);
      setExistingClasses(mine);
      setTotalClasses(mine.length);

      let quizCount = 0;
      for (const cls of mine) {
        const qzs = await QuizzesAPI.byClass(cls.id, token);
        quizCount += qzs.length;
      }
      setTotalQuizzes(quizCount);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Xử lý khi file được chọn
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  };

  // Xử lý khi file được kéo thả
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Xử lý khi file được thả
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Xử lý upload files
  const handleFiles = async (files: File[]) => {
    setIsUploading(true);

    for (const file of files) {
      setProcessingFile(file.name);

      try {
        // Kiểm tra duplicate file name
        const duplicateCheck = checkDuplicateFileName(file.name, documents);
        let shouldOverwrite = false;
        let customFileName: string | undefined = undefined;

        if (duplicateCheck.isDuplicate) {
          const action = await showDuplicateModal(
            file.name,
            duplicateCheck.suggestedName!
          );

          if (action.action === "cancel") {
            continue;
          } else if (action.action === "overwrite") {
            shouldOverwrite = true;
          } else if (action.action === "rename") {
            // User chose to rename - use the new name
            customFileName = action.newFileName!;
          }
        }

        // Lấy token
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          alert("Vui lòng đăng nhập để tải tài liệu.");
          continue;
        }

        // Nếu overwrite, xóa file cũ trước
        const { DocumentsAPI } = await import("../utils/api");
        if (shouldOverwrite) {
          const oldFile = documents.find(d => d.name === file.name);
          if (oldFile) {
            await DocumentsAPI.remove(oldFile.id, token);
          }
        }

        // Upload file lên server with custom name if renamed
        const uploaded = await DocumentsAPI.upload(file, token, customFileName);

        setDocuments((prev) => {
          const filtered = shouldOverwrite
            ? prev.filter((doc) => doc.name !== file.name)
            : prev;
          return [
            { ...uploaded, uploadedAt: new Date(uploaded.uploadedAt) },
            ...filtered,
          ];
        });
      } catch (error) {
        console.error("Lỗi khi xử lý file:", error);
        alert(`Lỗi khi xử lý file ${file.name}: ${error}`);
      }
    }

    setIsUploading(false);
    setProcessingFile(null);
  };

  // Đọc nội dung file
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const fileExtension = file.name.split(".").pop()?.toLowerCase();

      reader.onload = (e) => {
        try {
          if (fileExtension === "doc" || fileExtension === "docx") {
            // Đối với file Word, đọc dưới dạng ArrayBuffer và chuyển thành base64
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
              reject(new Error("Không thể đọc file Word"));
              return;
            }

            // Chuyển ArrayBuffer thành base64 string một cách an toàn
            const uint8Array = new Uint8Array(arrayBuffer);
            let binaryString = "";
            const chunkSize = 8192; // Xử lý theo chunks để tránh stack overflow

            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize);
              binaryString += String.fromCharCode.apply(
                null,
                Array.from(chunk)
              );
            }

            const base64String = btoa(binaryString);
            resolve(base64String);
          } else {
            // Đối với file text, đọc bình thường
            const content = e.target?.result as string;
            resolve(content || "");
          }
        } catch (error) {
          console.error("Lỗi khi xử lý nội dung file:", error);
          reject(new Error("Lỗi khi xử lý nội dung file"));
        }
      };

      reader.onerror = () => reject(new Error("Không thể đọc file"));

      // Chọn phương thức đọc phù hợp
      if (fileExtension === "doc" || fileExtension === "docx") {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  // Xác định loại file
  const getFileType = (fileName: string): "docs" | "json" | "txt" => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension === "doc" || extension === "docx") return "docs";
    if (extension === "json") return "json";
    return "txt"; // File .txt và các file khác
  };

  // Xử lý download file
  const handleDownload = async (file: UploadedFile) => {
    const link = document.createElement("a");

    try {
      // Check if file has filePath (new system) or content (legacy)
      if ((file as any).filePath) {
        // NEW FILE: Download từ server
        const { getApiBaseUrl } = await import("../utils/api");
        const fileUrl = `${getApiBaseUrl()}/${(file as any).filePath}`;
        link.href = fileUrl;
        link.download = file.name;
        link.click();
      } else if (file.content) {
        // LEGACY FILE: Download từ content
        if (file.type === "docs") {
          // Đối với file Word, chuyển base64 về binary
          const byteCharacters = atob(file.content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          link.href = URL.createObjectURL(blob);
        } else {
          // Đối với file text
          const blob = new Blob([file.content], { type: "text/plain" });
          link.href = URL.createObjectURL(blob);
        }

        link.download = file.name;
        link.click();

        // Cleanup URL sau khi download
        setTimeout(() => {
          URL.revokeObjectURL(link.href);
        }, 1000);
      } else {
        alert("File không có nội dung để tải về");
      }
    } catch (error) {
      console.error("Lỗi khi tải file:", error);
      alert("Có lỗi xảy ra khi tải file");
    }
  };

  // Xử lý tạo lớp từ file
  const handleCreateClass = (file: UploadedFile) => {
    setSelectedFile(file);
    setClassName("");
    setClassDescription("");
    setSelectedClassId("");
    setShowClassModal(true);
  };

  // Đóng modal
  const handleCloseModal = () => {
    setShowClassModal(false);
    setSelectedFile(null);
    setClassName("");
    setClassDescription("");
    setSelectedClassId("");
    setIsCreateNewClass(true);
  };

  // Xử lý submit modal
  const handleModalSubmit = async () => {
    if (!selectedFile) return;

    // Validation
    if (isCreateNewClass) {
      if (!className.trim()) {
        alert("Vui lòng nhập tên lớp học");
        return;
      }
      if (!classDescription.trim()) {
        alert("Vui lòng nhập mô tả lớp học");
        return;
      }
    } else {
      if (!selectedClassId) {
        alert("Vui lòng chọn lớp học");
        return;
      }
    }

    setIsProcessing(true);

    try {
      const { getToken } = await import("../utils/auth");
      const { DocumentsAPI, getApiBaseUrl } = await import("../utils/api");
      const token = getToken();

      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }

      // Lấy file data từ server
      const fileData = await DocumentsAPI.getById(selectedFile.id, token);

      let file: File;

      // Kiểm tra xem file có filePath không (file mới) hay content (file cũ)
      if (fileData.filePath) {
        // FILE MỚI: Download từ server
        const fileUrl = `${getApiBaseUrl()}/${fileData.filePath}`;
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        file = new File([blob], fileData.name, { type: blob.type });
      } else if (fileData.content) {
        // FILE CŨ: Tạo từ content
        const fileType = getFileType(fileData.name);

        if (fileType === "docs") {
          // Word file từ base64
          const binaryString = atob(fileData.content);
          const uint8Array = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            uint8Array[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([uint8Array], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          file = new File([blob], fileData.name, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
        } else {
          // Text file
          const blob = new Blob([fileData.content], { type: "text/plain" });
          file = new File([blob], fileData.name, { type: "text/plain" });
        }
      } else {
        alert("File data not found");
        return;
      }

      // Parse file
      const result = await parseFile(file);

      if (!result.success) {
        alert(
          `Không thể phân tích file. Lỗi: ${result.error || "Lỗi không xác định"}`
        );
        return;
      }

      if (!result.questions || result.questions.length === 0) {
        alert("Không tìm thấy câu hỏi nào trong file");
        return;
      }

      // Map images to questions and get unassigned images
      let unassignedImages: import('../types').ExtractedImage[] = [];
      if (result.images && result.images.length > 0 && result.textContent) {
        const { assignImagesToQuestions, getUnassignedImages } = await import("../utils/imageMapper");
        const questionsWithImages = assignImagesToQuestions(
          result.questions,
          result.images,
          result.textContent
        );
        result.questions = questionsWithImages;
        unassignedImages = getUnassignedImages(result.images);
        console.log(`✓ Mapped images to questions. ${unassignedImages.length} unassigned.`);
      }

      // Tạo quiz ID
      const quizId = `quiz-${Date.now()}-${Math.random()}`;

      // Chuyển đến EditQuizPage với dữ liệu
      navigate("/edit-quiz", {
        state: {
          questions: result.questions,
          fileName: selectedFile.name,
          fileId: quizId,
          uploadedFileId: selectedFile.id, // LƯU ID CỦA FILE
          unassignedImages, // Pass unassigned images
          classInfo: isCreateNewClass
            ? {
              isNew: true,
              name: className,
              description: classDescription,
            }
            : {
              isNew: false,
              classId: selectedClassId,
            },
        },
      });

      handleCloseModal();
    } catch (error) {
      console.error("Lỗi khi xử lý file:", error);
      alert("Có lỗi xảy ra khi xử lý file");
    } finally {
      setIsProcessing(false);
    }
  };

  // Xóa file
  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa tài liệu "${fileName}"?`)) {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          alert("Vui lòng đăng nhập.");
          return;
        }
        const { DocumentsAPI } = await import("../utils/api");
        await DocumentsAPI.remove(fileId, token);
        setDocuments((prev) => prev.filter((doc) => doc.id !== fileId));
        alert(`Đã xóa tài liệu "${fileName}" thành công!`);
      } catch (e) {
        console.error("Delete file failed:", e);
        alert("Xóa tài liệu thất bại.");
      }
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Get file icon
  const getFileIcon = (type: string) => {
    switch (type) {
      case "docs":
        return (
          <svg
            className="w-6 h-6 text-blue-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "json":
        return (
          <svg
            className="w-6 h-6 text-yellow-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "txt":
        return (
          <svg
            className="w-6 h-6 text-gray-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-6 h-6 text-gray-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Hero Section Mobile */}
      <div className="mb-8 lg:hidden">
        <div className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 dark:from-blue-900 dark:via-slate-900 dark:to-slate-950 p-8 sm:p-12 shadow-2xl">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          {/* Overlay pattern */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_#fff_1px,_transparent_0)] bg-[size:24px_24px] rounded-2xl pointer-events-none"></div>
          {/* Shimmer effect */}
          <div
            className="
              absolute inset-0
              opacity-30
              bg-gradient-to-r from-transparent via-white/65 to-transparent
              blur-[3px]
              animate-[shimmer_3s_ease-in-out_infinite]
              [mask-image:linear-gradient(to_right,transparent_0%,black_20%,black_80%,transparent_100%)]
              mix-blend-overlay
              rounded-2xl pointer-events-none
            "
          ></div>
          <div className="relative z-10">
            <h1 className="text-xl sm:text-2xl font-mono font-bold text-white mb-4 tracking-tight">
              Tài liệu của tôi
            </h1>
            <p className="text-sm sm:text-base font-mono text-blue-100 dark:text-blue-200 max-w-2xl leading-relaxed">
              Quản lý và tạo bài kiểm tra từ tài liệu
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Right Section - Kho tài liệu (chỉ hiển thị Kho tài liệu ở đây) */}
      <div className="lg:hidden mb-6 space-y-6">
        {/* Kho tài liệu học tập - Mobile */}
        <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 mb-3">
              <svg
                className="w-6 h-6 text-indigo-600 dark:text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Kho tài liệu học tập
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Độ khó: Liemdaidary🔥
            </p>
            <a
              href="https://lms.liemsdai.is-best.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-mono text-indigo-600 dark:text-indigo-400 hover:underline break-all"
            >
              lms.liemsdai.is-best.net
            </a>
          </div>

          <div className="flex items-center justify-center">
            <div
              className="perspective-1000 w-full"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <a
                href="https://lms.liemsdai.is-best.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group block"
              >
                <img
                  src={
                    isDarkMode
                      ? require("../assets/liemdai_dark.png")
                      : require("../assets/liemdai_light.png")
                  }
                  alt={isDarkMode ? "liemdai_dark" : "liemdai_light"}
                  className="w-full h-auto rounded-xl shadow-2xl transition-all duration-300 ease-out cursor-pointer hover:shadow-3xl"
                  style={{
                    maxHeight: 280,
                    transform: `perspective(1000px) rotateY(${mousePosition.x * 0.1
                      }deg) rotateX(${-mousePosition.y * 0.1}deg) translateZ(${Math.abs(mousePosition.x) + Math.abs(mousePosition.y) > 0
                        ? "20px"
                        : "0px"
                      })`,
                    border: "2px solid transparent",
                    backgroundImage: isDarkMode
                      ? "linear-gradient(45deg, #0ea5e9, #06b6d4, #10b981, #84cc16)"
                      : "linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b)",
                    backgroundSize: "400% 400%",
                    animation: "neonBorder 3s ease-in-out infinite",
                    backgroundClip: "border-box",
                    borderRadius: "12px",
                  }}
                />
                {/* Tooltip */}
                <div
                  className={`opacity-0 group-hover:opacity-100 pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-3 text-xs rounded-lg px-4 py-2 shadow-xl transition-opacity duration-200 z-20 whitespace-nowrap font-medium ${isDarkMode
                    ? "bg-gray-800 text-white border border-gray-700"
                    : "bg-white text-gray-900 border border-gray-200"
                    }`}
                >
                  Click để chuyển đến trang →
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Left Section - Main Content */}
        <div className="lg:w-[70%] min-w-0 order-1">
          {/* Desktop Banner - Only visible on lg and above */}
          <div className="hidden lg:block mb-8">
            <div className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 dark:from-blue-900 dark:via-slate-900 dark:to-slate-950 p-8 shadow-2xl">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
              {/* Overlay pattern */}
              <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_#fff_1px,_transparent_0)] bg-[size:24px_24px] rounded-2xl pointer-events-none"></div>
              {/* Shimmer effect */}
              <div
                className="
                  absolute inset-0
                  opacity-30
                  bg-gradient-to-r from-transparent via-white/65 to-transparent
                  blur-[3px]
                  animate-[shimmer_3s_ease-in-out_infinite]
                  [mask-image:linear-gradient(to_right,transparent_0%,black_20%,black_80%,transparent_100%)]
                  mix-blend-overlay
                  rounded-2xl pointer-events-none
                "
              ></div>
              <div className="relative z-10">
                <h1 className="text-2xl sm:text-3xl font-mono font-bold text-white mb-3 tracking-tight">
                  Tài liệu của tôi
                </h1>
                <p className="text-base font-mono text-blue-100 dark:text-blue-200 leading-relaxed">
                  Quản lý và sử dụng các tài liệu đã tải lên
                </p>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div className="card p-6 lg:p-8 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary-600 dark:text-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Tải lên tài liệu mới
              </h3>
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${dragActive
                ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 scale-[1.02]"
                : "border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500"
                }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Kéo thả File vào đây hoặc click để chọn File
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Hỗ trợ File .txt, .json, .doc, .docx
                  </p>

                  <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                    Chọn File
                    <input
                      type="file"
                      multiple
                      accept=".txt,.json,.doc,.docx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {processingFile
                      ? `Đang xử lý ${processingFile}...`
                      : "Đang tải lên..."}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    100%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-primary-600 h-2 rounded-full transition-all duration-300"></div>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-8 flex items-center justify-center">
              {(() => {
                const Any = require("../components/Spinner").default;
                return <Any size={36} />;
              })()}
            </div>
          ) : (
            // Danh sách tài liệu
            <div className="space-y-4">
              {/* Bulk Actions Header */}
              {/* Bulk Actions Header REMOVED - Replaced by FAB */}
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => {
                    if (selectedIds.size > 0) {
                      toggleSelection(doc.id);
                    }
                  }}
                  className={`group card p-4 sm:p-6 transition-all duration-300 border-l-4 
                    ${selectedIds.has(doc.id)
                      ? "bg-blue-50 dark:bg-blue-900/10 border-blue-500 ring-1 ring-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:shadow-xl hover:scale-[1.01]"
                      : selectedIds.size > 0
                        ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-xl hover:scale-[1.01] border-l-stone-400 dark:border-l-gray-600"
                        : "hover:shadow-xl hover:scale-[1.01] border-l-stone-400 dark:border-l-gray-600 hover:border-l-purple-500 dark:hover:border-l-purple-500"
                    }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
                    {/* Selection Overlay for entire card click (optional) */}

                    <div className="flex items-center space-x-3 sm:space-x-4">
                      {/* Custom Checkbox */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelection(doc.id);
                        }}
                        className={`relative w-6 h-6 flex-shrink-0 cursor-pointer rounded-full border-2 flex items-center justify-center transition-all duration-200
                          ${selectedIds.has(doc.id)
                            ? "bg-blue-600 border-blue-600 scale-105"
                            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-400"
                          }
                        `}
                      >
                        <svg
                          className={`w-3.5 h-3.5 text-white transition-all duration-200 ${selectedIds.has(doc.id) ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-shrink-0">
                        {getFileIcon(doc.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate">
                          {doc.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          <span>{formatFileSize(doc.size)}</span>
                          <span>•</span>
                          <span>Tải lên: {formatDate(doc.uploadedAt)}</span>
                          <span>•</span>
                          <span className="uppercase">{doc.type}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 sm:flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(doc);
                        }}
                        className="btn-secondary text-sm flex items-center flex-1 sm:flex-initial justify-center"
                      >
                        <svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Tải về
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateClass(doc);
                        }}
                        className="btn-primary text-sm flex items-center flex-1 sm:flex-initial justify-center"
                      >
                        <svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                        Tạo Quiz
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(doc.id, doc.name);
                        }}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2"
                        title="Xóa tài liệu"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats Card - Mobile Only (hiển thị ở cuối) */}
          <div className="lg:hidden mt-6">
            <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                  <svg
                    className="w-6 h-6 text-purple-600 dark:text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                  Thống kê tài liệu
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tổng quan tài liệu của bạn
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Số lượng tài liệu
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {documents.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Tài liệu mới nhất
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {documents.length > 0
                      ? formatDate(documents[0].uploadedAt)
                      : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Tổng dung lượng
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatFileSize(
                      documents.reduce((total, doc) => total + doc.size, 0)
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Lớp đã tạo
                  </span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {totalClasses}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <span className="text-sm text-blue-700 dark:text-blue-400">
                    Bài kiểm tra
                  </span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {totalQuizzes}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Desktop Only */}
        <div className="hidden lg:block lg:w-[30%] lg:flex-shrink-0 order-2">
          <div className="lg:sticky lg:top-20 space-y-6">
            {/* Stats Card */}
            <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                  <svg
                    className="w-6 h-6 text-purple-600 dark:text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                  Thống kê tài liệu
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tổng quan tài liệu của bạn
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Số lượng tài liệu
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {documents.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Tài liệu mới nhất
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {documents.length > 0
                      ? formatDate(documents[0].uploadedAt)
                      : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Tổng dung lượng
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatFileSize(
                      documents.reduce((total, doc) => total + doc.size, 0)
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Lớp đã tạo
                  </span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {totalClasses}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <span className="text-sm text-blue-700 dark:text-blue-400">
                    Bài kiểm tra
                  </span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {totalQuizzes}
                  </span>
                </div>
              </div>
            </div>

            {/* Kho tài liệu học tập */}
            <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 mb-3">
                  <svg
                    className="w-6 h-6 text-indigo-600 dark:text-indigo-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  Kho tài liệu học tập
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Độ khó: Liemdaidary🔥
                </p>
                <a
                  href="https://lms.liemsdai.is-best.net/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-mono text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                >
                  lms.liemsdai.is-best.net
                </a>
              </div>

              <div className="flex items-center justify-center">
                <div
                  className="perspective-1000 w-full"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <a
                    href="https://lms.liemsdai.is-best.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative group block"
                  >
                    <img
                      src={
                        isDarkMode
                          ? require("../assets/liemdai_dark.png")
                          : require("../assets/liemdai_light.png")
                      }
                      alt={isDarkMode ? "liemdai_dark" : "liemdai_light"}
                      className="w-full h-auto rounded-xl shadow-2xl transition-all duration-300 ease-out cursor-pointer hover:shadow-3xl"
                      style={{
                        maxHeight: 280,
                        transform: `perspective(1000px) rotateY(${mousePosition.x * 0.1
                          }deg) rotateX(${-mousePosition.y * 0.1
                          }deg) translateZ(${Math.abs(mousePosition.x) +
                            Math.abs(mousePosition.y) >
                            0
                            ? "20px"
                            : "0px"
                          })`,
                        border: "2px solid transparent",
                        backgroundImage: isDarkMode
                          ? "linear-gradient(45deg, #0ea5e9, #06b6d4, #10b981, #84cc16)"
                          : "linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b)",
                        backgroundSize: "400% 400%",
                        animation: "neonBorder 3s ease-in-out infinite",
                        backgroundClip: "border-box",
                        borderRadius: "12px",
                      }}
                    />
                    {/* Tooltip */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-3 text-xs rounded-lg px-4 py-2 shadow-xl transition-opacity duration-200 z-20 whitespace-nowrap font-medium ${isDarkMode
                        ? "bg-gray-800 text-white border border-gray-700"
                        : "bg-white text-gray-900 border border-gray-200"
                        }`}
                    >
                      Click để chuyển đến trang →
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal tạo lớp */}
      {showClassModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Tạo lớp từ tài liệu: {selectedFile?.name}
            </h3>

            {/* Radio buttons */}
            <div className="mb-6">
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="classOption"
                    checked={isCreateNewClass}
                    onChange={() => setIsCreateNewClass(true)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    Tạo lớp học mới
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="radio"
                    name="classOption"
                    checked={!isCreateNewClass}
                    onChange={() => setIsCreateNewClass(false)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    Chọn lớp học có sẵn
                  </span>
                </label>
              </div>
            </div>

            {/* Form fields */}
            {isCreateNewClass ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tên lớp học <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="Nhập tên lớp học"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mô tả lớp học <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={classDescription}
                    onChange={(e) => setClassDescription(e.target.value)}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
                    rows={3}
                    placeholder="Nhập mô tả lớp học"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Chọn lớp học <span className="text-red-500">*</span>
                </label>
                <div className="relative custom-class-dropdown">
                  <button
                    type="button"
                    onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                    className={`w-full px-4 py-3 flex items-center justify-between rounded-xl border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-gray-900 dark:text-white ${isClassDropdownOpen
                      ? "border-blue-500 ring-2 ring-blue-500/20"
                      : "border-gray-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400"
                      }`}
                  >
                    <span className={`font-medium flex-1 text-left ${!selectedClassId ? "text-gray-500 dark:text-gray-400" : ""}`}>
                      {selectedClassId
                        ? existingClasses.find((cls) => cls.id === selectedClassId)?.name
                        : "-- Chọn lớp học --"}
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isClassDropdownOpen ? "rotate-180" : ""
                        }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {isClassDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fadeIn">
                      <div className="p-1 max-h-60 overflow-y-auto custom-scrollbar space-y-1">

                        {existingClasses.map((cls, idx) => (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => {
                              setSelectedClassId(cls.id);
                              setIsClassDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-between group ${selectedClassId === cls.id
                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                              : "hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                              }`}
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold mt-0.5 ${selectedClassId === cls.id
                                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                }`}>
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{cls.name}</div>
                                {cls.description && (
                                  <div className={`text-xs mt-0.5 truncate ${selectedClassId === cls.id
                                    ? "text-blue-500 dark:text-blue-400"
                                    : "text-gray-500 dark:text-gray-500"
                                    }`}>
                                    {cls.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedClassId === cls.id && (
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleModalSubmit}
                disabled={isProcessing}
                className="flex-1 btn-primary flex items-center justify-center"
              >
                {isProcessing ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Đang xử lý...
                  </>
                ) : (
                  "Tiếp tục"
                )}
              </button>
              <button
                onClick={handleCloseModal}
                disabled={isProcessing}
                className="flex-1 btn-secondary"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Floating Action Bar (FAB) for Bulk Actions */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ease-out transform ${selectedIds.size > 0
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-20 opacity-0 scale-95 pointer-events-none"
          }`}
      >
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200 dark:border-gray-700 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 min-w-[320px] justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all active:scale-95 group"
              title="Bỏ chọn tất cả"
            >
              <svg className="w-6 h-6 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="font-semibold text-gray-900 dark:text-white text-lg">
              {selectedIds.size}
            </span>
          </div>

          <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>

          <div className="flex items-center gap-2">

            <button
              onClick={handleSelectAll}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all active:scale-95 group relative overflow-hidden"
              title={selectedIds.size === documents.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            >
              <div className="relative z-10">
                {selectedIds.size === documents.length ? (
                  <svg className="w-6 h-6 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 group-hover:text-blue-500 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7.53 12L9 10.5l1.4-1.41 2.07 2.08L17.17 6.5l1.41 1.41L12.47 14zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={handleBulkDownload}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all active:scale-95 group"
              title="Tải xuống File đã chọn"
            >
              <svg className="w-6 h-6 group-hover:text-green-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>

            <button
              onClick={handleBulkDelete}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all active:scale-95 group"
              title="Xóa File đã chọn"
            >
              <svg className="w-6 h-6 group-hover:text-red-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default DocumentsPage;
