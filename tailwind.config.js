/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class", // Hỗ trợ dark mode
  theme: {
    extend: {
      screens: {
        nav: "1024px", // Custom breakpoint cho navigation menu
        navicon: "1125px", // Custom breakpoint cho nav icons (1125px+)
      },

      fontFamily: {
        inter: ["Inter", "sans-serif"],
        space: ['"Space Mono"', "monospace"],
        share: ['"Share Tech Mono"', "monospace"],
      },

      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        stone: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          300: "#d6d3d1",
          400: "#a8a29e",
          500: "#78716c",
          600: "#57534e",
          700: "#44403c",
          800: "#292524",
          900: "#1c1917",
        },
      },

      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        slideInLeft: {
          "0%": { 
            transform: "translateX(-100%) scale(0.95)",
            opacity: "0"
          },
          "100%": { 
            transform: "translateX(0) scale(1)",
            opacity: "1"
          },
        },
        slideInRight: {
          "0%": { 
            transform: "translateX(100%) scale(0.95)",
            opacity: "0"
          },
          "100%": { 
            transform: "translateX(0) scale(1)",
            opacity: "1"
          },
        },
        slideOutLeft: {
          "0%": { 
            transform: "translateX(0) scale(1)",
            opacity: "1"
          },
          "100%": { 
            transform: "translateX(-100%) scale(0.95)",
            opacity: "0"
          },
        },
        slideOutRight: {
          "0%": { 
            transform: "translateX(0) scale(1)",
            opacity: "1"
          },
          "100%": { 
            transform: "translateX(100%) scale(0.95)",
            opacity: "0"
          },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        slideInLeft: "slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        slideInRight: "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        slideOutLeft: "slideOutLeft 0.3s cubic-bezier(0.4, 0, 1, 1)",
        slideOutRight: "slideOutRight 0.3s cubic-bezier(0.4, 0, 1, 1)",
      },
    },
  },
  plugins: [],
};
