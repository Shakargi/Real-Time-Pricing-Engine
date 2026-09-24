import React from 'react';

interface ErrorBannerProps {
    title: string;
    message: string;
}

/**
 * Shared "system fault" banner. Previously each page hand-rolled its own copy
 * of this block with slightly different markup — extracted here so losing any
 * backend connection reads exactly the same way everywhere in the app.
 */
const ErrorBanner: React.FC<ErrorBannerProps> = ({ title, message }) => (
    <div className="terminal-panel reveal" style={{ padding: 'var(--space-md)', borderLeft: '4px solid var(--status-offline)' }}>
        <span style={{ color: 'var(--status-offline)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {title}:
        </span>
        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
            {message}
        </span>
    </div>
);

export default ErrorBanner;
