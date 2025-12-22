import React, { ReactNode } from "react";
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
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
            {/* Mobile/Tablet Layout (< 1280px) - Uses Old Header/Footer */}
            <div className="xl:hidden flex flex-col min-h-screen">
                <Header />
                <main className="flex-1 pt-16">
                    {children}
                </main>
                <Footer />
            </div>

            {/* Desktop Layout (>= 1280px) - App-like Layout (Window scroll hidden, Main scrolls) */}
            <div className="hidden xl:flex h-screen overflow-hidden">
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
