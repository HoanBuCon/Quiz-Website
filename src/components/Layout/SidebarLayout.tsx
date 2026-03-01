import React, { ReactNode, useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";
import ChatBox from "../ChatBox";
import QuizResumer from "../QuizResumer";

interface SidebarLayoutProps {
    children: ReactNode;
    noPadding?: boolean;
}

const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, noPadding = false }) => {
    // Combined state to track layout mode
    // Desktop Layout active if Width >= 1280px AND Height >= 620px
    const [isDesktopMode, setIsDesktopMode] = useState<boolean>(() => {
        if (typeof window !== "undefined") {
            return window.innerWidth >= 1280 && window.innerHeight >= 700;
        }
        return false;
    });

    useEffect(() => {
        const checkLayout = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            setIsDesktopMode(width >= 1280 && height >= 700);
        };

        // Check initially
        checkLayout();

        // Listen for resize
        window.addEventListener('resize', checkLayout);
        return () => window.removeEventListener('resize', checkLayout);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
            {!isDesktopMode ? (
                /* Mobile/Tablet Layout */
                <div className="flex flex-col min-h-screen">
                    <Header />
                    <main className="flex-1 pt-16">
                        {children}
                    </main>
                    {/* <Footer /> */}
                </div>
            ) : (
                /* Desktop Layout */
                <div className="flex h-screen overflow-hidden">
                    <Sidebar />
                    <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
                        <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-8'} custom-scrollbar`}>
                            {children}
                        </div>
                    </main>
                </div>
            )}

            {/* Global Components */}
            <ChatBox hideOnDesktop={true} />
            <QuizResumer />
        </div>
    );
};

export default SidebarLayout;
