'use client';

import { useState, useEffect, useRef } from 'react';

const LOG_LEVEL_COLORS = {
    DEBUG: 'text-blue-400',
    INFO: 'text-green-400',
    WARN: 'text-yellow-400',
    ERROR: 'text-red-400',
    CRITICAL: 'text-purple-400'
};

export default function LogConsole({ isConnected, sendCommand }) {
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLevels, setSelectedLevels] = useState({
        DEBUG: true,
        INFO: true,
        WARN: true,
        ERROR: true,
        CRITICAL: true
    });
    const [logLevel, setLogLevel] = useState('INFO');
    const [isExpanded, setIsExpanded] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const logsEndRef = useRef(null);
    
    // Request logs on component mount and when connected
    useEffect(() => {
        if (isConnected) {
            sendCommand({ type: 'getLogs' });
        }
    }, [isConnected, sendCommand]);
    
    // Function to handle log messages from server
    const handleLogMessage = (data) => {
        if (data.type === 'log') {
            setLogs(prevLogs => {
                const newLogs = [...prevLogs, data.entry];
                // Keep only the last 1000 logs in state to prevent memory issues
                if (newLogs.length > 1000) {
                    return newLogs.slice(-1000);
                }
                return newLogs;
            });
        } else if (data.type === 'logHistory') {
            setLogs(data.logs || []);
        }
    };
    
    // Register message handler
    useEffect(() => {
        if (window.logMessageHandlers) {
            window.logMessageHandlers.push(handleLogMessage);
        } else {
            window.logMessageHandlers = [handleLogMessage];
        }
        
        return () => {
            if (window.logMessageHandlers) {
                window.logMessageHandlers = window.logMessageHandlers.filter(
                    handler => handler !== handleLogMessage
                );
            }
        };
    }, []);
    
    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (autoScroll && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [filteredLogs, autoScroll]);
    
    // Apply filters
    useEffect(() => {
        let filtered = [...logs];
        
        // Apply level filter
        const selectedLevelsList = Object.entries(selectedLevels)
            .filter(([_, selected]) => selected)
            .map(([level]) => level);
            
        filtered = filtered.filter(log => selectedLevelsList.includes(log.level));
        
        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(log => 
                log.message.toLowerCase().includes(term) || 
                (log.data && log.data.toLowerCase().includes(term))
            );
        }
        
        setFilteredLogs(filtered);
    }, [logs, selectedLevels, searchTerm]);
    
    // Change server log level
    const handleLogLevelChange = (e) => {
        const newLevel = e.target.value;
        setLogLevel(newLevel);
        sendCommand({ 
            type: 'setLogLevel', 
            level: newLevel 
        });
    };
    
    // Toggle level filter
    const toggleLevel = (level) => {
        setSelectedLevels(prev => ({
            ...prev,
            [level]: !prev[level]
        }));
    };
    
    // Clear logs
    const clearLogs = () => {
        setLogs([]);
    };
    
    // Export logs
    const exportLogs = (format = 'json') => {
        let url;
        if (window.location.protocol === 'https:') {
            url = `https://${window.location.hostname}:3001/api/logs/export?format=${format}`;
        } else {
            url = `http://${window.location.hostname}:3001/api/logs/export?format=${format}`;
        }
        
        // Add filters to export URL
        const selectedLevelsList = Object.entries(selectedLevels)
            .filter(([_, selected]) => selected)
            .map(([level]) => level);
            
        if (selectedLevelsList.length > 0 && selectedLevelsList.length < 5) {
            url += `&level=${selectedLevelsList.join(',')}`;
        }
        
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        
        // Open in new tab
        window.open(url, '_blank');
    };
    
    // Format timestamp
    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };
    
    return (
        <div className={`bg-gray-800 rounded-xl shadow-lg ${isExpanded ? 'h-[70vh]' : ''} border border-gray-700 transition-all duration-300 overflow-hidden`}>
            <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-700 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold">Journal système</h2>
                        <span className="text-xs bg-gray-700 rounded-full px-2 py-1 text-gray-300">
                            {filteredLogs.length} entrées
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 text-gray-400 hover:text-white"
                            title={isExpanded ? "Réduire" : "Agrandir"}
                        >
                            {isExpanded ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
                
                {isExpanded && (
                    <div className="flex flex-col sm:flex-row gap-3 mb-2">
                        <div className="flex-1">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Rechercher dans les logs..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">Niveau:</span>
                            <select
                                value={logLevel}
                                onChange={handleLogLevelChange}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white"
                                disabled={!isConnected}
                            >
                                <option value="DEBUG">DEBUG</option>
                                <option value="INFO">INFO</option>
                                <option value="WARN">WARN</option>
                                <option value="ERROR">ERROR</option>
                                <option value="CRITICAL">CRITICAL</option>
                            </select>
                        </div>
                    </div>
                )}
                
                {isExpanded && (
                    <div className="flex justify-between items-center">
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(LOG_LEVEL_COLORS).map(level => (
                                <button
                                    key={level}
                                    onClick={() => toggleLevel(level)}
                                    className={`text-xs px-2 py-1 rounded ${selectedLevels[level] ? LOG_LEVEL_COLORS[level] + ' bg-gray-900' : 'text-gray-500 bg-gray-800'}`}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setAutoScroll(!autoScroll)}
                                className={`text-xs px-2 py-1 rounded ${autoScroll ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-400'}`}
                                title={autoScroll ? "Désactiver défilement auto" : "Activer défilement auto"}
                            >
                                Auto-défilement
                            </button>
                            <button
                                onClick={clearLogs}
                                className="text-xs px-2 py-1 rounded bg-red-900 text-red-300"
                                title="Effacer les logs"
                            >
                                Effacer
                            </button>
                            <div className="relative group">
                                <button
                                    className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300"
                                >
                                    Exporter
                                </button>
                                <div className="absolute right-0 mt-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
                                    <button 
                                        onClick={() => exportLogs('json')}
                                        className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-700 text-gray-300"
                                    >
                                        JSON
                                    </button>
                                    <button 
                                        onClick={() => exportLogs('csv')}
                                        className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-700 text-gray-300"
                                    >
                                        CSV
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className={`bg-gray-900 font-mono text-xs ${isExpanded ? 'h-[calc(100%-8rem)] overflow-y-auto' : 'max-h-24 overflow-y-auto'}`}>
                {filteredLogs.length === 0 ? (
                    <div className="p-4 text-gray-400 text-center">
                        Aucun log disponible
                    </div>
                ) : (
                    <table className="w-full table-fixed">
                        <colgroup>
                            <col width="100" />
                            <col width="80" />
                            <col />
                        </colgroup>
                        <tbody>
                            {filteredLogs.map((log, index) => (
                                <tr 
                                    key={index} 
                                    className="border-b border-gray-800 hover:bg-gray-800"
                                >
                                    <td className="p-2 text-gray-400">
                                        {formatTimestamp(log.timestamp)}
                                    </td>
                                    <td className={`p-2 ${LOG_LEVEL_COLORS[log.level]}`}>
                                        {log.level}
                                    </td>
                                    <td className="p-2 text-gray-300 break-words">
                                        {log.message}
                                        {log.data && (
                                            <div className="text-gray-500 mt-1">
                                                {log.data}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            <tr ref={logsEndRef}></tr>
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}