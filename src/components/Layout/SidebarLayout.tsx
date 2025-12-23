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
    // State to track if height is small (< 600px)
    const [isSmallHeight, setIsSmallHeight] = useState(false);

    useEffect(() => {
        const checkHeight = () => {
            setIsSmallHeight(window.innerHeight < 620);
        };

        // Check initially
        checkHeight();

        // Listen for resize
        window.addEventListener('resize', checkHeight);
        return () => window.removeEventListener('resize', checkHeight);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
            {/* Mobile/Tablet Layout (< 1280px OR Height < 600px) - Uses Old Header/Footer */}
            {/* If isSmallHeight is true, we force this block to show by removing xl:hidden (making it flex always) */}
            <div className={`${isSmallHeight ? 'flex' : 'xl:hidden flex'} flex-col min-h-screen`}>
                <Header />
                <main className="flex-1 pt-16">
                    {children}
                </main>
                <Footer />
            </div>

            {/* Desktop Layout (>= 1280px AND Height >= 600px) - App-like Layout */}
            {/* If isSmallHeight is true, we force this block to hide regardless of width */}
            <div className={`${isSmallHeight ? 'hidden' : 'hidden xl:flex'} h-screen overflow-hidden`}>
                <Sidebar />
                <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
                    <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-8'} custom-scrollbar`}>
                        {children}
                    </div>
                </main>
            </div>

            {/* Global Components */}
            <ChatBox hideOnDesktop={true} />
            <QuizResumer />
        </div>
    );
};

export default SidebarLayout;
