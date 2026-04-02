import React from 'react';
import { SparklesIcon } from './icons';

// This component uses CSS animations defined in index.html
const LoadingQAnimation: React.FC = () => {
    return (
        <div className="loading-q-animation-container">
            <div className="sparkles-wrapper">
                <SparklesIcon className="w-8 h-8 text-brand-primary" />
            </div>
            <div className="q-wrapper">
                <svg className="q-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    {/* Stylized Q Path */}
                    <path className="q-circle-path" d="M 48,32 A 16,16 0 1,1 16,32 A 16,16 0 1,1 48,32 Z" />
                    <path className="q-tick-path" d="M 40,40 L 50,50" />
                </svg>
            </div>
        </div>
    );
};

export default LoadingQAnimation;