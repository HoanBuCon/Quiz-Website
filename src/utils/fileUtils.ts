import { UploadedFile } from "../types";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingFile?: UploadedFile;
  suggestedName?: string;
}

export interface DuplicateAction {
  action: "overwrite" | "rename" | "cancel";
  newFileName?: string;
}

/**
 * Format date to DD/MM/YYYY
 */
export const formatDate = (date: Date | string, includeTime: boolean = false): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Check if date is valid
  if (isNaN(d.getTime())) return "Invalid Date";
  
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  
  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }
  
  return `${day}/${month}/${year}`;
};

/**
 * Kiểm tra xem tên file có bị trùng không và đề xuất tên mới
 */
export const checkDuplicateFileName = (
  fileName: string,
  existingFiles: UploadedFile[]
): DuplicateCheckResult => {
  const existingFile = existingFiles.find((file) => file.name === fileName);

  if (!existingFile) {
    return { isDuplicate: false };
  }

  // Tạo tên file mới với số thứ tự
  const suggestedName = generateUniqueFileName(fileName, existingFiles);

  return {
    isDuplicate: true,
    existingFile,
    suggestedName,
  };
};

/**
 * Tạo tên file duy nhất bằng cách thêm số thứ tự
 */
export const generateUniqueFileName = (
  originalName: string,
  existingFiles: UploadedFile[]
): string => {
  const existingNames = existingFiles.map((file) => file.name);

  if (!existingNames.includes(originalName)) {
    return originalName;
  }

  const lastDotIndex = originalName.lastIndexOf(".");
  const nameWithoutExtension =
    lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName;
  const extension =
    lastDotIndex > 0 ? originalName.substring(lastDotIndex) : "";

  let counter = 1;
  let newName = `${nameWithoutExtension}(${counter})${extension}`;

  while (existingNames.includes(newName)) {
    counter++;
    newName = `${nameWithoutExtension}(${counter})${extension}`;
  }

  return newName;
};

/**
 * Hiển thị modal xác nhận duplicate file
 */
export const showDuplicateModal = (
  fileName: string,
  suggestedName: string
): Promise<DuplicateAction> => {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50";

    // Kiểm tra theme hiện tại
    const isDarkMode = document.documentElement.classList.contains("dark");

    modal.innerHTML = `
      <div class="bg-white ${
        isDarkMode ? "dark:bg-gray-800" : ""
      } rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
        <div class="flex items-center mb-4">
          <svg class="w-6 h-6 text-yellow-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.996-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-gray-900 ${
            isDarkMode ? "dark:text-white" : ""
          }">
            Tên file bị trùng
          </h3>
        </div>
        
        <p class="text-gray-600 ${isDarkMode ? "dark:text-gray-300" : ""} mb-6">
          File <strong>"${fileName}"</strong> đã tồn tại. Bạn muốn làm gì?
        </p>
        
        <div class="space-y-3 mb-6">
          <label class="flex items-center cursor-pointer p-3 rounded-lg border ${
            isDarkMode
              ? "border-gray-600 hover:bg-gray-700"
              : "border-gray-200 hover:bg-gray-50"
          } transition-colors">
            <input type="radio" name="duplicateAction" value="overwrite" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3">
            <div>
              <div class="font-medium text-gray-900 ${
                isDarkMode ? "dark:text-white" : ""
              }">
                Ghi đè lên File cũ
              </div>
              <div class="text-sm text-gray-500 ${
                isDarkMode ? "dark:text-gray-400" : ""
              }">
                File cũ sẽ bị thay thế hoàn toàn
              </div>
            </div>
          </label>
          
          <label class="flex items-center cursor-pointer p-3 rounded-lg border ${
            isDarkMode
              ? "border-gray-600 hover:bg-gray-700"
              : "border-gray-200 hover:bg-gray-50"
          } transition-colors">
            <input type="radio" name="duplicateAction" value="rename" checked class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3">
            <div>
              <div class="font-medium text-gray-900 ${
                isDarkMode ? "dark:text-white" : ""
              }">
                Đổi tên File mới
              </div>
              <div class="text-sm text-blue-600 ${
                isDarkMode ? "dark:text-blue-400" : ""
              } font-mono">
                → "${suggestedName}"
              </div>
            </div>
          </label>
        </div>
        
        <div class="flex space-x-3">
          <button id="confirmBtn" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Xác nhận
          </button>
          <button id="cancelBtn" class="flex-1 bg-gray-300 ${
            isDarkMode ? "dark:bg-gray-600" : ""
          } text-gray-700 ${
      isDarkMode ? "dark:text-gray-200" : ""
    } px-4 py-2 rounded-lg hover:bg-gray-400 ${
      isDarkMode ? "dark:hover:bg-gray-500" : ""
    } transition-colors font-medium">
            Hủy
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const confirmBtn = modal.querySelector("#confirmBtn") as HTMLButtonElement;
    const cancelBtn = modal.querySelector("#cancelBtn") as HTMLButtonElement;
    const radioButtons = modal.querySelectorAll(
      'input[name="duplicateAction"]'
    ) as NodeListOf<HTMLInputElement>;

    const cleanup = () => {
      document.body.removeChild(modal);
    };

    confirmBtn.addEventListener("click", () => {
      const selectedAction = Array.from(radioButtons).find(
        (radio) => radio.checked
      )?.value as "overwrite" | "rename";

      cleanup();

      if (selectedAction === "overwrite") {
        resolve({ action: "overwrite" });
      } else if (selectedAction === "rename") {
        resolve({ action: "rename", newFileName: suggestedName });
      }
    });

    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve({ action: "cancel" });
    });

    // Close on escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        resolve({ action: "cancel" });
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        cleanup();
        resolve({ action: "cancel" });
      }
    });
  });
};
