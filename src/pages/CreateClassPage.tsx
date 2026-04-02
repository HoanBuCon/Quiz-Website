import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UploadedFile } from "../types";
import { parseFile, questionsToStandardText } from "../utils/docsParser";
import {
  checkDuplicateFileName,
  showDuplicateModal,
  generateUniqueFileName,
  formatDate,
} from "../utils/fileUtils";
import { getToken } from "../utils/auth";
import formatGuideUrl from "../assets/HUONG_DAN_DINH_DANG_WORD.docx";
import AIGeneratorModal from "../components/AIGeneratorModal";

// Component trang tạo lớp
const CreateClassPage: React.FC = () => {
  const navigate = useNavigate();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [className, setClassName] = useState("");
  const [classDescription, setClassDescription] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [isCreateNewClass, setIsCreateNewClass] = useState(true);
  const [existingClasses, setExistingClasses] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!getToken());
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [isAIGeneratorOpen, setAIGeneratorOpen] = useState(false);

  // Handler: AI Modal returns questions -> navigate to editor with class info
  const handleAIGeneratedForClass = (aiQuestions: any[], textContent?: string | null) => {
    if (!isFormValid()) {
      alert("Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz");
      return;
    }
    const quizId = `ai-${Date.now()}-${Math.random()}`;

    if (textContent) {
      // Theory mode: navigate with the raw text pre-loaded in editorState via quizTitle trick
      navigate("/edit-quiz", {
        state: {
          questions: [],
          fileName: "Quiz AI",
          fileId: quizId,
          aiTextContent: textContent, // EditQuizPage can read this from location.state
          classInfo: isCreateNewClass
            ? { isNew: true, name: className.trim(), description: classDescription.trim() }
            : { isNew: false, classId: selectedClassId },
        },
      });
      return;
    }

    const mappedQuestions = aiQuestions.map((q, index) => ({
      ...q,
      id: `q_ai_${Date.now()}_${index}`,
    }));

    // Convert JSON questions to standard text format for the editor
    const generatedTextContent = questionsToStandardText(mappedQuestions);
    navigate("/edit-quiz", {
      state: {
        questions: [], // Let editor re-parse from aiTextContent
        fileName: "Quiz AI",
        fileId: quizId,
        aiTextContent: generatedTextContent,
        classInfo: isCreateNewClass
          ? { isNew: true, name: className.trim(), description: classDescription.trim() }
          : { isNew: false, classId: selectedClassId },
      },
    });
  };

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".custom-class-dropdown")) {
        setIsClassDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Kiểm tra xem form có hợp lệ không
  const isFormValid = () => {
    if (isCreateNewClass) {
      return className.trim() !== "" && classDescription.trim() !== "";
    } else {
      return selectedClassId !== "";
    }
  };

  // Đồng bộ trạng thái đăng nhập và load danh sách lớp học
  useEffect(() => {
    const refreshAuth = async () => {
      const token = getToken();
      setIsLoggedIn(!!token);
      if (!token) return;
      try {
        const { ClassesAPI } = await import("../utils/api");
        const mine = await ClassesAPI.listMine(token);
        // Only show classes owned by the user, not shared ones
        setExistingClasses(mine.filter((c: any) => c.accessType === 'owner'));
      } catch (e) {
        // console.error("Failed to load classes:", e);
      }
    };

    refreshAuth();
    const handler = () => refreshAuth();
    window.addEventListener("authChange", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("authChange", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Xử lý khi file được chọn
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Kiểm tra validation trước
    if (!isFormValid()) {
      event.target.value = ""; // Reset input
      if (isCreateNewClass) {
        alert(
          "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
        );
      } else {
        alert(
          "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
        );
      }
      return;
    }

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

    // Kiểm tra validation trước
    if (!isFormValid()) {
      if (isCreateNewClass) {
        alert(
          "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
        );
      } else {
        alert(
          "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
        );
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Tạo lớp học mới (để backward compatibility với các hàm khác)
  const createNewClass = (quizId: string) => {
    // console.log("createNewClass called with quizId:", quizId);
    // console.log(
    //   "This function is deprecated - class creation now happens in EditQuizPage"
    // );

    // Trả về null để các hàm khác biết rằng không tạo lớp ở đây
    return null;
  };

  // Thêm quiz vào lớp học có sẵn (để backward compatibility với các hàm khác)
  const addQuizToExistingClass = (quizId: string) => {
    // console.log("addQuizToExistingClass called with quizId:", quizId);
    // console.log(
    //   "This function is deprecated - class creation now happens in EditQuizPage"
    // );

    // Trả về null để các hàm khác biết rằng không tạo lớp ở đây
    return null;
  };

  // Xử lý chuyển đến trang tạo quiz thủ công
  const handleCreateManualQuiz = () => {
    // console.log("handleCreateManualQuiz called");

    // Kiểm tra validation trước
    if (!isFormValid()) {
      if (isCreateNewClass) {
        alert(
          "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
        );
      } else {
        alert(
          "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
        );
      }
      return;
    }

    const quizId = `manual-${Date.now()}-${Math.random()}`;
    // console.log("Generated quizId:", quizId);

    // KHÔNG tự động tạo lớp học - chỉ chuẩn bị thông tin để tạo sau khi xuất bản

    // console.log("About to navigate to /edit-quiz with state:", {
    //   questions: [],
    //   fileName: "Quiz thủ công",
    //   fileId: quizId,
    //   classInfo: isCreateNewClass
    //     ? {
    //       isNew: true,
    //       name: className.trim(),
    //       description: classDescription.trim(),
    //     }
    //     : {
    //       isNew: false,
    //       classId: selectedClassId,
    //     },
    // });

    navigate("/edit-quiz", {
      state: {
        questions: [],
        fileName: "Quiz thủ công",
        fileId: quizId,
        classInfo: isCreateNewClass
          ? {
            isNew: true,
            name: className.trim(),
            description: classDescription.trim(),
          }
          : {
            isNew: false,
            classId: selectedClassId,
          },
      },
    });

    // console.log("Navigation completed");
  };

  // Xử lý upload files
  const handleFiles = async (files: File[]) => {
    // console.log("handleFiles called with files:", files);

    // Kiểm tra validation trước khi xử lý file
    if (isCreateNewClass) {
      if (!className.trim()) {
        alert("Vui lòng nhập tên lớp học trước khi tải file");
        return;
      }
      if (!classDescription.trim()) {
        alert("Vui lòng nhập mô tả lớp học trước khi tải file");
        return;
      }
    } else {
      if (!selectedClassId) {
        alert("Vui lòng chọn lớp học trước khi tải file");
        return;
      }
    }

    setIsUploading(true);

    for (const file of files) {
      // console.log("Processing file:", file.name);
      setProcessingFile(file.name);

      try {
        const fileExtension = file.name.split(".").pop()?.toLowerCase();
        if (!["doc", "docx", "txt", "json"].includes(fileExtension || "")) {
          alert(`File ${file.name} không được hỗ trợ. Chỉ chấp nhận .doc, .docx, .txt, .json`);
          continue;
        }

        // 1. UPLOAD FILE LÊN SERVER
        const token = getToken();

        if (!token) {
          alert("Vui lòng đăng nhập để tải file lên");
          continue;
        }

        const { DocumentsAPI } = await import("../utils/api");

        // Fetch existing documents to check for duplicates
        // Note: This adds an extra network call but ensures we don't accidentally overwrite files
        // and enables the auto-rename functionality requested.
        let uploadName = file.name;
        try {
          const existingDocs = await DocumentsAPI.listMine(token);
          const duplicateCheck = checkDuplicateFileName(file.name, existingDocs);

          if (duplicateCheck.isDuplicate) {
            // Auto-rename logic as requested: default to (n) style without prompting
            uploadName = generateUniqueFileName(file.name, existingDocs);
            // console.log(`Auto-renaming duplicate file: ${file.name} -> ${uploadName}`);
          }
        } catch (error) {
          // console.warn("Failed to check for duplicates, proceeding with original name", error);
        }

        // console.log("Uploading file to server...");
        // Use the potentially new name
        const uploadedDoc = await DocumentsAPI.upload(file, token, uploadName);

        // console.log("File uploaded to server:", uploadedDoc);

        // 2. PARSE FILE locally để lấy questions
        // console.log("Parsing file locally...");
        const result = await parseFile(file);
        // console.log("Parse result:", result);

        if (!result.success) {
          const errorMessage = `File ${file.name} có lỗi định dạng:\n\n${result.error}\n\nHướng dẫn sử dụng file:\n1. Sử dụng font đơn giản (Times New Roman, Arial)\n2. Không sử dụng bullet points, chỉ dùng A. B. C. D.\n3. Không sử dụng màu sắc hoặc định dạng phức tạp\n4. Đánh dấu đáp án đúng bằng dấu *\n5. Xem template-docs.txt để biết định dạng chuẩn`;
          alert(errorMessage);
          continue;
        }

        if (!result.questions || result.questions.length === 0) {
          alert(`Không tìm thấy câu hỏi nào trong file ${file.name}`);
          continue;
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
          // console.log(`✓ Mapped images to questions. ${unassignedImages.length} unassigned.`);
        }

        // 3. Navigate đến EditQuizPage với file info
        const quizId = `quiz-${Date.now()}-${Math.random()}`;

        // console.log("Navigating to edit-quiz with uploadedFileId:", uploadedDoc.id);

        navigate("/edit-quiz", {
          state: {
            questions: result.questions,
            fileName: file.name,
            fileId: quizId,
            uploadedFileId: uploadedDoc.id, // LƯU ID CỦA FILE ĐÃ UPLOAD
            unassignedImages, // Pass unassigned images
            classInfo: isCreateNewClass
              ? {
                isNew: true,
                name: className.trim(),
                description: classDescription.trim(),
              }
              : {
                isNew: false,
                classId: selectedClassId,
              },
          },
        });

        // Chỉ xử lý file đầu tiên, sau đó navigate
        break;
      } catch (error) {
        // console.error("Error processing file:", error);
        alert(`Lỗi khi xử lý file ${file.name}: ${error}`);
      }
    }

    setIsUploading(false);
    setProcessingFile(null);
  };

  // Đọc nội dung file (chuẩn hóa cho Word: đọc dạng ArrayBuffer và chuyển base64)
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const fileExtension = file.name.split(".").pop()?.toLowerCase();
      reader.onload = (e) => {
        try {
          if (fileExtension === "doc" || fileExtension === "docx") {
            // Đọc file Word dạng ArrayBuffer và chuyển base64
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
              reject(new Error("Không thể đọc file Word"));
              return;
            }
            const uint8Array = new Uint8Array(arrayBuffer);
            let binaryString = "";
            const chunkSize = 8192;
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
            // File text/json đọc bình thường
            const content = e.target?.result as string;
            resolve(content || "");
          }
        } catch (error) {
          // console.error("Lỗi khi xử lý nội dung file:", error);
          reject(new Error("Lỗi khi xử lý nội dung file"));
        }
      };
      reader.onerror = () => reject(new Error("Không thể đọc file"));
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

  // Xóa file đã upload
  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  return (
    <div>
      {/* Hero Section (Unified) */}
      <div className="mb-8 lg:mb-12 w-full relative overflow-hidden group bg-gradient-to-bl from-blue-600 via-blue-700 to-blue-900 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 shadow-2xl animate-slideDownIn">
        {/* Decorative elements */}
        {/* <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div> */}
        {/* <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div> */}
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
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-mono font-bold text-white mb-4 tracking-tight text-center lg:text-left">
            Tạo lớp học mới
          </h1>
          <p className="text-base font-mono sm:text-lg text-blue-100 dark:text-blue-200 max-w-2xl leading-relaxed text-center lg:text-left mx-auto lg:mx-0">
            Tạo bài kiểm tra thủ công hoặc tự động
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 sm:pb-12">
        {/* Quick Navigation Buttons - Mobile Only */}
        <div className="mb-6 lg:hidden">
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg shadow-md transition-all duration-200 font-medium"
              onClick={() => {
                const guideSection = document.getElementById(
                  "mobile-guidance-section"
                );
                if (guideSection) {
                  guideSection.scrollIntoView({ behavior: "smooth" });
                }
              }}
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
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span className="text-sm">Hướng dẫn</span>
            </button>
            <button
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-lg shadow-md transition-all duration-200 font-medium"
              onClick={() => {
                const previewSection = document.getElementById(
                  "mobile-preview-section"
                );
                if (previewSection) {
                  previewSection.scrollIntoView({ behavior: "smooth" });
                }
              }}
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <span className="text-sm">Preview</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
          {/* Left Section - Main Content */}
          <div className="lg:w-[70%] min-w-0">


            {/* Block các thẻ tạo lớp/quiz/upload */}
            <div className="relative">
              {/* Class Selection/Creation Section */}
              <div
                className={`group bg-white dark:bg-gray-800 rounded-xl shadow-lg mb-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-gray-300 dark:border-l-gray-600 hover:border-l-orange-500 dark:hover:border-l-orange-500 animate-slideUpIn anim-delay-100 ${!isLoggedIn ? "pointer-events-none filter blur-[2px]" : ""
                  }`}
              >
                <div className="p-6 space-y-6">
                  {/* Toggle giữa tạo mới và chọn có sẵn */}
                  <div className="flex space-x-4">
                    <label className="flex items-center cursor-pointer group">
                      <input
                        type="radio"
                        name="classOption"
                        checked={isCreateNewClass}
                        onChange={() => setIsCreateNewClass(true)}
                        className="mr-3 w-5 h-5 text-orange-600 border-gray-300 focus:ring-orange-500"
                      />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        Tạo lớp học mới
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer group">
                      <input
                        type="radio"
                        name="classOption"
                        checked={!isCreateNewClass}
                        onChange={() => setIsCreateNewClass(false)}
                        className="mr-3 w-5 h-5 text-orange-600 border-gray-300 focus:ring-orange-500"
                      />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        Chọn lớp học có sẵn
                      </span>
                    </label>
                  </div>

                  {/* Form tạo lớp mới */}
                  {isCreateNewClass ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Tên lớp học <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={className}
                          onChange={(e) => setClassName(e.target.value)}
                          placeholder="Ví dụ: Lớp KHMT K69A - Machine Learning"
                          className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Mô tả lớp học <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={classDescription}
                          onChange={(e) => setClassDescription(e.target.value)}
                          placeholder="Nhập mô tả chi tiết về lớp học, mục tiêu học tập..."
                          rows={4}
                          className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none transition-all"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Dropdown chọn lớp có sẵn */
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Chọn lớp học <span className="text-red-500">*</span>
                      </label>

                      <div className="relative custom-class-dropdown mb-3">
                        <button
                          onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                          className={`w-full px-4 py-3 flex items-center justify-between relative border-2 rounded-lg shadow-sm transition-all duration-200 ${isClassDropdownOpen
                            ? "border-primary-500 ring-2 ring-primary-500"
                            : "border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400"
                            } bg-white dark:bg-gray-700 text-gray-900 dark:text-white`}
                        >
                          <span className={`block truncate text-left ${!selectedClassId ? "text-gray-500 dark:text-gray-400" : "font-medium"}`}>
                            {selectedClassId
                              ? existingClasses.find((c) => c.id === selectedClassId)?.name
                              : "-- Chọn lớp học --"}
                          </span>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform duration-200 absolute right-3 lg:static ${isClassDropdownOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isClassDropdownOpen && (
                          <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
                            <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                              <p className="text-xs font-semibold text-white uppercase tracking-wider">
                                Danh sách lớp học của bạn
                              </p>
                            </div>
                            <div className="p-1 max-h-60 overflow-y-auto custom-scrollbar">
                              {existingClasses.map((cls, idx) => (
                                <button
                                  key={cls.id}
                                  onClick={() => {
                                    setSelectedClassId(cls.id);
                                    setIsClassDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-200 group flex items-start gap-3 ${selectedClassId === cls.id
                                    ? "bg-primary-50 dark:bg-primary-900/20"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                    }`}
                                >
                                  <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold mt-0.5 ${selectedClassId === cls.id
                                    ? "bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400"
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                                    }`}>
                                    {idx + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className={`block font-medium text-sm truncate ${selectedClassId === cls.id
                                      ? "text-primary-700 dark:text-primary-300"
                                      : "text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                                      }`}>
                                      {cls.name}
                                    </span>
                                    {cls.description && (
                                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                        {cls.description}
                                      </span>
                                    )}
                                  </div>
                                  {selectedClassId === cls.id && (
                                    <svg className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {existingClasses.length === 0 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 flex items-center gap-2">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Chưa có lớp học nào. Hãy tạo lớp học mới.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Quiz Creation */}
              <div
                className={`group bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mb-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-gray-300 dark:border-l-gray-600 hover:border-l-primary-500 dark:hover:border-l-primary-500 animate-slideUpIn anim-delay-200 ${!isLoggedIn ? "pointer-events-none filter blur-[2px]" : ""
                  }`}
              >
                <div className="p-6">
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
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Tạo Quiz thủ công
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Tự nhập câu hỏi và đáp án
                      </p>
                    </div>
                  </div>
                  {!isFormValid() && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <svg
                        className="w-5 h-5 text-amber-600 dark:text-amber-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                        {isCreateNewClass
                          ? "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
                          : "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"}
                      </p>
                    </div>
                  )}

                  <div
                    className={`border-2 border-solid rounded-xl p-8 text-center transition-all duration-300 ${!isFormValid()
                      ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 opacity-50"
                      : "border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500"
                      }`}
                  >
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-primary-600 dark:text-primary-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>

                      <div>
                        <h3
                          className={`text-lg font-medium mb-2 ${isFormValid()
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400"
                            }`}
                        >
                          Tạo bài kiểm tra thủ công
                        </h3>
                        <p
                          className={`mb-4 ${isFormValid()
                            ? "text-gray-600 dark:text-gray-400"
                            : "text-gray-500 dark:text-gray-500"
                            }`}
                        >
                          Tạo bài kiểm tra bằng cách nhập câu hỏi và đáp án trực
                          tiếp vào hệ thống
                        </p>

                        <button
                          onClick={handleCreateManualQuiz}
                          disabled={!isFormValid()}
                          className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors duration-200 ${isFormValid()
                            ? "bg-primary-500 hover:bg-primary-600 text-white shadow-lg"
                            : "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400"
                            }`}
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
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          Tạo đề trắc nghiệm
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div
                className={`flex items-center my-8 animate-slideUpIn anim-delay-300 ${!isLoggedIn ? "pointer-events-none filter blur-[2px]" : ""
                  }`}
              >
                <div className="flex-1 border-t-2 border-gray-300 dark:border-gray-600"></div>
                <span className="px-6 text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full py-1">
                  hoặc
                </span>
                <div className="flex-1 border-t-2 border-gray-300 dark:border-gray-600"></div>
              </div>

              {/* Upload Area */}
              <div
                className={`group bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 border-l-gray-300 dark:border-l-gray-600 hover:border-l-primary-500 dark:hover:border-l-primary-500 animate-slideUpIn anim-delay-400 ${!isLoggedIn ? "pointer-events-none filter blur-[2px]" : ""
                  }`}
              >
                <div className="p-6">
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
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Tải lên File câu hỏi
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Hỗ trợ .docx và .txt
                      </p>
                    </div>
                  </div>
                  {!isFormValid() && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <svg
                        className="w-5 h-5 text-amber-600 dark:text-amber-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                        {isCreateNewClass
                          ? "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"
                          : "Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz"}
                      </p>
                    </div>
                  )}

                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${!isFormValid()
                      ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 opacity-50 cursor-not-allowed"
                      : dragActive
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-105 shadow-lg"
                        : "border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500"
                      }`}
                    onDragEnter={isFormValid() ? handleDrag : undefined}
                    onDragLeave={isFormValid() ? handleDrag : undefined}
                    onDragOver={isFormValid() ? handleDrag : undefined}
                    onDrop={isFormValid() ? handleDrop : undefined}
                  >
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-primary-600 dark:text-primary-400"
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
                        <h3
                          className={`text-lg font-medium mb-2 ${isFormValid()
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400"
                            }`}
                        >
                          Kéo thả File vào đây hoặc click để chọn File
                        </h3>
                        <p
                          className={`mb-4 ${isFormValid()
                            ? "text-gray-600 dark:text-gray-400"
                            : "text-gray-500 dark:text-gray-500"
                            }`}
                        >
                          Hỗ trợ File .txt, .json, .doc, .docx
                        </p>
                        <label
                          className={`cursor-pointer inline-flex items-center gap-2 ${isFormValid()
                            ? "px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-semibold shadow-lg transition-colors duration-200"
                            : "px-6 py-3 bg-gray-300 text-gray-500 rounded-lg font-semibold cursor-not-allowed dark:bg-gray-600 dark:text-gray-400"
                            }`}
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
                            disabled={!isFormValid()}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider before AI section */}
              <div
                className={`flex items-center my-8 animate-slideUpIn anim-delay-500 ${!isLoggedIn ? "pointer-events-none filter blur-[2px]" : ""}`}
              >
                <div className="flex-1 border-t-2 border-gray-300 dark:border-gray-600"></div>
                <span className="px-6 text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full py-1">
                  hoặc
                </span>
                <div className="flex-1 border-t-2 border-gray-300 dark:border-gray-600"></div>
              </div>

              {/* AI Quiz Creation */}
              <div
                className={`group bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 border-l-gray-300 dark:border-l-gray-600 hover:border-l-purple-500 dark:hover:border-l-purple-500 animate-slideUpIn anim-delay-500 ${!isLoggedIn ? "pointer-events-none filter blur-[2px]" : ""}`}
              >
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        Tạo Quiz bằng AI
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Tự động tạo Quiz từ tài liệu
                      </p>
                    </div>
                  </div>

                  {!isFormValid() && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                        Vui lòng tạo lớp học mới hoặc chọn lớp có sẵn trước khi tạo Quiz
                      </p>
                    </div>
                  )}

                  <div
                    className={`border-2 border-solid rounded-xl p-8 text-center transition-all duration-300 ${!isFormValid()
                      ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 opacity-50"
                      : "border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500"
                      }`}
                  >
                    <div className="space-y-4">
                      <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className={`text-lg font-medium mb-2 ${isFormValid() ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                          LIEMD.AI sẽ đọc tài liệu và tạo bài kiểm tra
                        </h3>
                        <p className={`mb-4 ${isFormValid() ? "text-gray-600 dark:text-gray-400" : "text-gray-500 dark:text-gray-500"}`}>
                          Vui lòng không tải lên tài liệu có dung lượng quá lớn. LIEMD.AI chỉ hỗ trợ khoảng 30 câu hỏi mỗi tài liệu
                        </p>
                        <button
                          onClick={() => { if (isFormValid()) setAIGeneratorOpen(true); }}
                          disabled={!isFormValid()}
                          className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors duration-200 ${isFormValid()
                            ? "bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
                            : "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400"
                            }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Mở AI Generator
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!isLoggedIn && (
                <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center">
                  <div className="px-6 py-3 rounded-xl bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-white text-base sm:text-lg font-bold tracking-wide shadow-2xl ring-1 ring-primary-500/30">
                    Vui lòng đăng nhập để tạo lớp học
                  </div>
                </div>
              )}
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

            {/* AI Generator Modal */}
            <AIGeneratorModal
              isOpen={isAIGeneratorOpen}
              onClose={() => setAIGeneratorOpen(false)}
              onQuestionsGenerated={handleAIGeneratedForClass}
            />

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Files đã tải lên
                </h3>
                <div className="space-y-3">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="card p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                          <span className="text-primary-600 dark:text-primary-400 font-medium">
                            {file.type.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {file.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {(file.size / 1024).toFixed(1)} KB •{" "}
                            {formatDate(file.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Section - Desktop Only, Sticky Sidebar */}
          <div className="hidden lg:block lg:w-[30%] lg:flex-shrink-0">
            <div className="lg:sticky lg:top-20 space-y-6">
              {/* Hướng dẫn - Desktop */}
              <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 animate-slideLeftIn anim-delay-200">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                    <svg
                      className="w-6 h-6 text-green-600 dark:text-green-400"
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
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Hướng dẫn
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Định dạng file hỗ trợ:
                    </h4>
                    <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ml-3.5">
                      <li className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-green-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Text files (.txt) - Khuyến nghị
                      </li>
                      <li className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-green-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        JSON files (.json)
                      </li>
                      <li className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-green-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Word files (.doc, .docx)
                      </li>
                    </ul>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                      Kích thước tối đa:
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 ml-3.5">
                      10 MB mỗi file
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                      Lưu ý quan trọng:
                    </h4>
                    <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 ml-3.5">
                      <li>• File sẽ được xử lý tự động</li>
                      <li>• File Word (.docx) đã được hỗ trợ</li>
                      <li>• Sử dụng font đơn giản (Times New Roman, Arial)</li>
                      <li>• Không sử dụng bullet points</li>
                      <li>• Chỉ dùng A. B. C. D. cho đáp án</li>
                      <li>• Xem preview để biết định dạng chuẩn</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Preview Format - Desktop */}
              <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 animate-slideLeftIn anim-delay-300">
                <div className="text-center mb-4">
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Preview định dạng
                  </h3>
                  <a
                    href={formatGuideUrl}
                    download="HUONG_DAN_DINH_DANG_WORD.docx"
                    className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Tải File mẫu
                  </a>
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-[500px] overflow-y-auto custom-scrollbar">
                  <div className="text-xs font-mono text-gray-700 dark:text-gray-300 space-y-4">

                    {/* Câu 1 */}
                    <div>
                      <div className="font-medium">
                        Câu 1: Dữ liệu là gì? <span className="text-gray-400 italic">// Câu hỏi định dạng chọn 1 đáp án đúng</span>
                      </div>
                      <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*A. Thông tin chưa được xử lý</div>
                      <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4">B. Thông tin đã qua xử lý</div>
                      <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4">C. Dữ liệu không có cấu trúc</div>
                      <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4">D. Thông tin được mã hóa</div>
                      <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                    </div>

                    <div className="border-t border-gray-300 dark:border-gray-600"></div>

                    {/* Câu 2 */}
                    <div>
                      <div className="font-medium">
                        Câu 2: Những công nghệ nào thường được sử dụng trong việc xử lý Big Data? <span className="text-gray-400 italic">// Câu hỏi định dạng chọn nhiều đáp án đúng</span>
                      </div>
                      <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*A. MapReduce</div>
                      <div className="ml-4">B. SQL</div>
                      <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*C. Spark</div>
                      <div className="ml-4">D. MongoDB</div>
                    </div>

                    <div className="border-t border-gray-300 dark:border-gray-600"></div>

                    {/* Câu 3 */}
                    <div>
                      <div className="font-medium">
                        Câu 3: Những Frameworks nào sau đây sử dụng để xây dựng giao diện website? <span className="text-gray-400 italic">// Câu hỏi định dạng chọn nhiều đáp án đúng</span>
                      </div>
                      <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*A. ReactJS</div>
                      <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*B. AngularJS</div>
                    </div>

                    <div className="border-t border-gray-300 dark:border-gray-600"></div>

                    {/* Câu 4 */}
                    <div>
                      <div className="font-medium">
                        Câu 4: ELT là viết tắt của 3 từ nào (viết 3 từ phân tách nhau bằng khoảng trắng)? <span className="text-gray-400 italic">// Câu hỏi định dạng điền đáp án</span>
                      </div>
                      <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4 text-purple-600 dark:text-purple-400 font-semibold">result: Extract Load Transform</div>
                    </div>

                    <div className="border-t border-gray-300 dark:border-gray-600"></div>

                    {/* Câu 5 */}
                    <div>
                      <div className="font-medium">
                        Câu 5: Ghép loại dữ liệu với ví dụ tương ứng <span className="text-gray-400 italic">// Câu hỏi định dạng kéo thả đáp án</span>
                      </div>
                      <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
                        result: [“File JSON”, “Bảng dữ liệu”, “Bản ghi nhớ”, “Chịu chết”]<br />
                        group: (“Dữ liệu có cấu trúc”:[“Bảng dữ liệu”, “Chịu chết”]),(“Dữ liệu bán cấu trúc”:[“File JSON”])
                      </div>
                    </div>

                    <div className="border-t border-gray-300 dark:border-gray-600"></div>

                    {/* Câu 6 */}
                    <div>
                      <div className="font-medium">
                        Câu 6: Đọc và trả lời các câu hỏi sau <span className="text-gray-400 italic">// Câu hỏi định dạng câu hỏi mẹ chứa nhiều câu hỏi con</span>
                      </div>
                      <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                      <div className="ml-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {`{
Câu 1: What is the main topic? // Câu hỏi con sẽ không chứa được hình ảnh
*A. Science
B. Art

Câu 2: Who is HoanBuCon?
*A. HoanBuLiem
*B. HoanLigma

Câu 3: HoanBuCon deepstrike?
*A. Sure
B. No
*C. Factos
D. WTF BRO

Câu 4: Who is the author?
result: HoanBuCon
}`}
                      </div>
                    </div>

                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-bold">
                      Dấu *
                    </span>
                    chỉ định đáp án đúng
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      Câu N:
                    </span>
                    Nội dung câu hỏi phải viết cùng dòng với "Câu N"
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">
                      A B C D:
                    </span>
                    Các đáp án câu hỏi chọn 1 hoặc nhiều đáp án đúng
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">
                      result:
                    </span>
                    Ghi đáp án đúng mà người làm quiz cần điền
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">
                      result & group:
                    </span>
                    Câu hỏi kéo thả, xem hướng dẫn trong File
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">
                      Câu N: {`{ Câu hỏi con }`}
                    </span>
                    Câu hỏi mẹ chứa các câu hỏi con
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Right Section - Hướng dẫn và Preview */}
        <div className="lg:hidden mt-8 space-y-6">
          {/* Hướng dẫn Card - Mobile */}
          <div
            id="mobile-guidance-section"
            className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900"
          >
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                <svg
                  className="w-6 h-6 text-green-600 dark:text-green-400"
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Hướng dẫn
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  Định dạng file hỗ trợ:
                </h4>
                <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ml-3.5">
                  <li className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Text files (.txt) - Khuyến nghị
                  </li>
                  <li className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    JSON files (.json)
                  </li>
                  <li className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Word files (.doc, .docx)
                  </li>
                </ul>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                  Kích thước tối đa:
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-3.5">
                  10 MB mỗi file
                </p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                  Lưu ý quan trọng:
                </h4>
                <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 ml-3.5">
                  <li>• File sẽ được xử lý tự động</li>
                  <li>• File Word (.docx) đã được hỗ trợ</li>
                  <li>• Sử dụng font đơn giản (Times New Roman, Arial)</li>
                  <li>• Không sử dụng bullet points</li>
                  <li>• Chỉ dùng A. B. C. D. cho đáp án</li>
                  <li>• Xem preview để biết định dạng chuẩn</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Preview Card - Mobile */}
          <div
            id="mobile-preview-section"
            className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900"
          >
            <div className="text-center mb-4">
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
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Preview định dạng
              </h3>
              <a
                href={formatGuideUrl}
                download="HUONG_DAN_DINH_DANG_WORD.docx"
                className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center justify-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Tải File mẫu
              </a>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="text-xs font-mono text-gray-700 dark:text-gray-300 space-y-4">
                <div className="font-bold text-sm">Tuần 1</div>

                {/* Câu 1 */}
                <div>
                  <div className="font-medium">
                    Câu 1: Dữ liệu là gì? <span className="text-gray-400 italic">// Câu hỏi định dạng chọn 1 đáp án đúng</span>
                  </div>
                  <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*A. Thông tin chưa được xử lý</div>
                  <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4">B. Thông tin đã qua xử lý</div>
                  <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4">C. Dữ liệu không có cấu trúc</div>
                  <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4">D. Thông tin được mã hóa</div>
                  <div className="ml-10 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                </div>

                <div className="border-t border-gray-300 dark:border-gray-600"></div>

                {/* Câu 2 */}
                <div>
                  <div className="font-medium">
                    Câu 2: Những công nghệ nào thường được sử dụng trong việc xử lý Big Data? <span className="text-gray-400 italic">// Câu hỏi định dạng chọn nhiều đáp án đúng</span>
                  </div>
                  <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*A. MapReduce</div>
                  <div className="ml-4">B. SQL</div>
                  <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*C. Spark</div>
                  <div className="ml-4">D. MongoDB</div>
                </div>

                <div className="border-t border-gray-300 dark:border-gray-600"></div>

                {/* Câu 3 */}
                <div>
                  <div className="font-medium">
                    Câu 3: Những Frameworks nào sau đây sử dụng để xây dựng giao diện website? <span className="text-gray-400 italic">// Câu hỏi định dạng chọn nhiều đáp án đúng</span>
                  </div>
                  <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*A. ReactJS</div>
                  <div className="ml-4 text-green-600 dark:text-green-400 font-semibold">*B. AngularJS</div>
                </div>

                <div className="border-t border-gray-300 dark:border-gray-600"></div>

                {/* Câu 4 */}
                <div>
                  <div className="font-medium">
                    Câu 4: ELT là viết tắt của 3 từ nào (viết 3 từ phân tách nhau bằng khoảng trắng)? <span className="text-gray-400 italic">// Câu hỏi định dạng điền đáp án</span>
                  </div>
                  <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4 text-purple-600 dark:text-purple-400 font-semibold">result: Extract Load Transform</div>
                </div>

                <div className="border-t border-gray-300 dark:border-gray-600"></div>

                {/* Câu 5 */}
                <div>
                  <div className="font-medium">
                    Câu 5: Ghép loại dữ liệu với ví dụ tương ứng <span className="text-gray-400 italic">// Câu hỏi định dạng kéo thả đáp án</span>
                  </div>
                  <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
                    result: [“File JSON”, “Bảng dữ liệu”, “Bản ghi nhớ”, “Chịu chết”]<br />
                    group: (“Dữ liệu có cấu trúc”:[“Bảng dữ liệu”, “Chịu chết”]), (“Dữ liệu bán cấu trúc”:[“File JSON”])
                  </div>
                </div>

                <div className="border-t border-gray-300 dark:border-gray-600"></div>

                {/* Câu 6 */}
                <div>
                  <div className="font-medium">
                    Câu 6: Đọc và trả lời các câu hỏi sau <span className="text-gray-400 italic">// Câu hỏi định dạng câu hỏi mẹ chứa nhiều câu hỏi con</span>
                  </div>
                  <div className="ml-4 text-blue-500 italic">&lt;Hình ảnh nếu có&gt;</div>
                  <div className="ml-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {`{
Câu 1: What is the main topic? // Câu hỏi con sẽ không chứa được hình ảnh
*A. Science
B. Art

Câu 2: Who is HoanBuCon?
*A. HoanBuLiem
*B. HoanLigma

Câu 3: HoanBuCon deepstrike?
*A. Sure
B. No
*C. Factos
D. WTF BRO

Câu 4: Who is the author?
result: HoanBuCon
}`}
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 font-bold">
                  Dấu *
                </span>
                chỉ định đáp án đúng
              </p>
              <p className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  Câu N:
                </span>
                Nội dung câu hỏi phải viết cùng dòng với "Câu N"
              </p>
              <p className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">
                  A B C D:
                </span>
                Các đáp án câu hỏi chọn 1 hoặc nhiều đáp án đúng
              </p>
              <p className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">
                  result:
                </span>
                Ghi đáp án đúng mà người làm quiz cần điền
              </p>
              <p className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">
                  result & group:
                </span>
                Câu hỏi kéo thả, xem hướng dẫn trong File
              </p>
              <p className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">
                  Câu N: {`{ Câu hỏi con }`}
                </span>
                Câu hỏi mẹ chứa các câu hỏi con
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

  );
};

export default CreateClassPage;
