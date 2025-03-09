'use client';

import { useState, useEffect } from 'react';
import useWebSocket from './hooks/useWebSocket';
import DebugPanel from './components/DebugPanel';
import CameraPanel from './components/CameraPanel';
import LogConsole from './components/LogConsole';

export default function Home() {
  const { isConnected, systemStats, statusMessage, sendCommand, wsUrl, connect } = useWebSocket();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [customWsUrl, setCustomWsUrl] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Add debug toggle keyboard shortcut
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey && e.key === 'd') {
        setShowDebug(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Format uptime into human-readable format
  const formatUptime = (seconds) => {
    if (!seconds || isNaN(seconds)) return 'N/A';
    
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}j ${hours}h ${minutes}m`;
  };

  const handleCommand = (command) => {
    // For critical commands, show confirmation first
    if (command === 'reboot' || command === 'shutdown') {
      setConfirmAction(command);
      return;
    }
    
    sendCommand({ type: command });
  };
  
  const handleCustomConnection = (e) => {
    e.preventDefault();
    if (customWsUrl) {
      connect(customWsUrl);
      setShowConnectModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center relative">
          <button
            onClick={() => setIsHelpModalOpen(true)}
            className="absolute right-0 top-0 p-2 text-gray-400 hover:text-white transition-colors"
            title="Comment se connecter"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <h1 className="text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
            [noo]bots
          </h1>
          <p className="text-gray-400 mb-4">Interface de contrôle Raspberry Pi pour débutants</p>
          <div className="flex items-center justify-center gap-4">
            <div 
              className="flex items-center gap-2 bg-gray-800 rounded-full px-4 py-2 cursor-pointer hover:bg-gray-700"
              onClick={() => setShowConnectModal(true)}
              title="Configurer la connexion"
            >
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium">
                {isConnected ? 'Connecté' : 'Déconnecté'}
              </span>
            </div>
            {statusMessage && (
              <span className="text-sm text-gray-400 bg-gray-800 rounded-full px-4 py-2">
                {statusMessage}
              </span>
            )}
            {systemStats.hostname && (
              <span className="text-xs text-gray-400 bg-gray-800 rounded-full px-3 py-1 ml-2">
                {systemStats.hostname}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* System Stats Panel */}
          <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold">Métriques système</h2>
              {systemStats.model && (
                <span className="text-xs bg-gray-700 rounded-full px-2 py-1 text-gray-300">
                  {systemStats.model}
                </span>
              )}
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Charge CPU</span>
                  <span className="text-sm font-mono">{systemStats.cpuLoad}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${systemStats.cpuLoad}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Mémoire utilisée</span>
                  <span className="text-sm font-mono">{systemStats.memoryUsed}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${systemStats.memoryUsed}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Température</span>
                  <span className="text-sm font-mono">{systemStats.temperature}°C</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-500 to-red-500 transition-all duration-500"
                    style={{ width: `${Math.min((systemStats.temperature / 100) * 100, 100)}%` }}
                  />
                </div>
              </div>
              
              {systemStats.uptime && (
                <div className="pt-2 border-t border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Uptime</span>
                    <span className="text-sm font-mono">{formatUptime(systemStats.uptime)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold">Contrôles du robot</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleCommand('reboot')}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Redémarrer
              </button>
              <button
                onClick={() => handleCommand('shutdown')}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                </svg>
                Éteindre
              </button>
              <button
                onClick={() => handleCommand('startStatsMonitoring')}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Surveiller
              </button>
              <button
                onClick={() => handleCommand('stopStatsMonitoring')}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Arrêter
              </button>
              <button
                onClick={() => handleCommand('partyMode')}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-pink-500 hover:bg-pink-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected}
              >
                <span role="img" aria-label="party mode">🎉</span>
                Party Mode
              </button>
            </div>
          </div>
        </div>

        {/* Camera Panel */}
        <div className="mt-6">
          <CameraPanel 
            isConnected={isConnected} 
            sendCommand={sendCommand} 
            serverHost={wsUrl} 
          />
        </div>

        {/* Log Console */}
        <div className="mt-6">
          <LogConsole
            isConnected={isConnected}
            sendCommand={sendCommand}
          />
        </div>
        
        {/* Status Log */}
        <div className="mt-6 bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">État du système</h2>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
            <p className="text-gray-300">{statusMessage || 'Aucun message'}</p>
          </div>
        </div>

        {/* Help Modal */}
        {isHelpModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start md:items-center justify-center p-4 z-50 overflow-y-auto">
            <div
              className="bg-gray-800 rounded-xl w-full max-w-2xl my-8 p-4 sm:p-6 border border-gray-700 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="absolute right-2 top-2 sm:right-4 sm:top-4 text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500 rounded-lg hidden sm:block">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg sm:text-xl font-bold">Comment connecter votre Raspberry Pi</h2>
              </div>

              <div className="space-y-6 text-gray-300 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2 -mr-2">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-sm">1</span>
                    Installer les logiciels requis
                  </h3>
                  <div className="bg-gray-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                    <p className="mb-2">$ sudo apt update</p>
                    <p className="mb-2">$ sudo apt install nodejs npm</p>
                    <p>$ npm install -g pm2</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-sm">2</span>
                    Cloner et configurer [noo]bots
                  </h3>
                  <div className="bg-gray-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                    <p className="mb-2">$ git clone https://github.com/yourusername/noobots.git</p>
                    <p className="mb-2">$ cd noobots</p>
                    <p>$ npm install</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-sm">3</span>
                    Démarrer le serveur
                  </h3>
                  <div className="bg-gray-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                    <p className="mb-2">$ pm2 start npm --name "noobots" -- start</p>
                    <p>$ pm2 save</p>
                  </div>
                  <p className="mt-2 text-sm text-gray-400">Le serveur restera actif même après un redémarrage.</p>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-sm">4</span>
                    Accéder à l'interface
                  </h3>
                  <p className="mb-2 text-sm">Ouvrez votre navigateur et allez à:</p>
                  <div className="bg-gray-900 rounded-lg p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                    <p>http://adresse-ip-raspberry-pi:3000</p>
                  </div>
                  <p className="mt-2 text-sm text-gray-400">Remplacez 'adresse-ip-raspberry-pi' par l'adresse IP de votre Pi.</p>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-sm">5</span>
                    Accès à distance
                  </h3>
                  <ul className="list-none space-y-3 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Configurez une redirection de port sur votre routeur (port 3001)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Cliquez sur l'indicateur de connexion pour configurer l'URL du serveur</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Format de l'URL pour l'accès distant: ws://ADRESSE-IP-EXTERNE:3001</span>
                    </li>
                  </ul>
                </div>

                <div className="pb-2">
                  <h3 className="text-base sm:text-lg font-semibold mb-2 text-white flex items-center gap-2">
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Dépannage
                  </h3>
                  <ul className="list-none space-y-3 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Assurez-vous que votre Raspberry Pi est sur le même réseau que votre appareil</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Vérifier si le serveur est en marche:<br />
                        <code className="font-mono bg-gray-900 px-2 py-1 rounded text-xs sm:text-sm mt-1 inline-block">pm2 status</code>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Voir les logs:<br />
                        <code className="font-mono bg-gray-900 px-2 py-1 rounded text-xs sm:text-sm mt-1 inline-block">pm2 logs noobots</code>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>Redémarrer le serveur:<br />
                        <code className="font-mono bg-gray-900 px-2 py-1 rounded text-xs sm:text-sm mt-1 inline-block">pm2 restart noobots</code>
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connection Modal */}
        {showConnectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl w-full max-w-md p-6 border border-gray-700 relative">
              <button
                onClick={() => setShowConnectModal(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <h2 className="text-xl font-bold mb-6">Configurer la connexion</h2>
              <form onSubmit={handleCustomConnection}>
                <div className="mb-6">
                  <label htmlFor="wsUrl" className="block text-sm font-medium text-gray-400 mb-2">
                    URL du serveur WebSocket
                  </label>
                  <input
                    id="wsUrl"
                    type="text"
                    value={customWsUrl}
                    onChange={(e) => setCustomWsUrl(e.target.value)}
                    placeholder="ws://adresse-ip:3001"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Format: ws://192.168.1.xxx:3001
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Connecter
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmAction && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl w-full max-w-md p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-red-400">Confirmation</h2>
              <p className="mb-6">
                {confirmAction === 'reboot' 
                  ? 'Voulez-vous vraiment redémarrer le Raspberry Pi?' 
                  : 'Voulez-vous vraiment éteindre le Raspberry Pi?'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    sendCommand({ type: confirmAction });
                    setConfirmAction(null);
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {showDebug && (
          <DebugPanel
            wsStatus={isConnected}
            lastMessage={statusMessage}
            wsUrl={wsUrl}
          />
        )}
      </div>
    </div>
  );
}
