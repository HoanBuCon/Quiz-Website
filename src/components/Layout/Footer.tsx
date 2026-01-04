import React from "react";

// Component Footer của website
const Footer: React.FC = () => {
  return (
    <footer className="bg-gradient-to-r from-blue-900 to-blue-600 dark:bg-gradient-to-r dark:from-[#1a1e3a] dark:to-[#181824] mt-auto shadow-xl">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-[1.16rem] sm:py-[1.55rem] relative">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="text-center md:text-left mb-4 md:mb-0">
            <p className="text-xs sm:text-base text-white dark:text-primary-300 font-medium">
              © {new Date().getFullYear()}
              <span
                className="mx-2 font-semibold"
                style={{
                  fontFamily:
                    "'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace",
                }}
              >
                liemdai
              </span>
              Bản quyền thuộc về @hoanbucon
            </p>
          </div>
          <div className="flex space-x-8">
            <a
              href="http://hoanbucon.id.vn/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { }}
              className="text-xs sm:text-base text-white dark:text-primary-300 hover:text-primary-200 dark:hover:text-primary-400 transition-all duration-300 font-medium hover:scale-105 transform"
            >
              Về chúng tôi
            </a>
            <a
              href="http://hoanbucon.id.vn/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { }}
              className="text-xs sm:text-base text-white dark:text-primary-300 hover:text-primary-200 dark:hover:text-primary-400 transition-all duration-300 font-medium hover:scale-105 transform"
            >
              Hỗ trợ
            </a>
            <a
              href="http://hoanbucon.id.vn/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { }}
              className="text-xs sm:text-base text-white dark:text-primary-300 hover:text-primary-200 dark:hover:text-primary-400 transition-all duration-300 font-medium hover:scale-105 transform"
            >
              Liên hệ
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
