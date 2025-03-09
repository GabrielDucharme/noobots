export default function DebugPanel({ wsStatus, lastMessage, wsUrl }) {
    return (
        <div className="fixed bottom-4 right-4 bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 max-w-md z-40">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-300">WebSocket Debug</h3>
                <div className={`w-2 h-2 rounded-full ${wsStatus ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <div className="space-y-2 text-xs">
                <div className="bg-gray-900 p-2 rounded">
                    <span className="text-gray-400">URL: </span>
                    <span className="text-gray-200 font-mono break-all">{wsUrl}</span>
                </div>
                <div className="bg-gray-900 p-2 rounded">
                    <span className="text-gray-400">Status: </span>
                    <span className="text-gray-200">{wsStatus ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div className="bg-gray-900 p-2 rounded">
                    <span className="text-gray-400">Last Message: </span>
                    <span className="text-gray-200 font-mono break-all">{lastMessage || 'None'}</span>
                </div>
                <div className="text-gray-400 text-xs mt-3">
                    <p>Astuces pour la connexion à distance:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                        <li>Ouvrir le port 3001 sur le routeur</li>
                        <li>Format URL: ws://IP-EXTERNE:3001</li>
                        <li>Appuyez sur Ctrl+D pour masquer le panneau de débogage</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
