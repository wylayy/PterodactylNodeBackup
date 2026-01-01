import { useState, useEffect } from 'react';
import { getBackups, getNodes, createBackup, deleteBackup, getBackupLogs, downloadBackup } from '../api';
import type { Backup, BackupLog, Node as ServerNode } from '../api';
import { Plus, Trash2, Loader2, X, RefreshCw, Download, FileText, AlertCircle, Info } from 'lucide-react';

export default function Backups() {
    const [backups, setBackups] = useState<Backup[]>([]);
    const [nodes, setNodes] = useState<ServerNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showLogs, setShowLogs] = useState<number | null>(null);
    const [logs, setLogs] = useState<BackupLog[]>([]);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ nodeId: '', storageType: 'local' });

    useEffect(() => { load(); }, []);

    // Auto-refresh for running backups
    useEffect(() => {
        const hasRunning = backups.some(b => b.status === 'running' || b.status === 'pending');
        if (hasRunning) {
            const interval = setInterval(load, 2000);
            return () => clearInterval(interval);
        }
    }, [backups]);

    const load = async () => {
        const [b, n] = await Promise.all([getBackups(), getNodes()]);
        setBackups(b.data);
        setNodes(n.data);
        setLoading(false);
    };

    const handleCreate = async () => {
        setCreating(true);
        await createBackup({ nodeId: parseInt(form.nodeId), storageType: form.storageType });
        setShowModal(false);
        load();
        setCreating(false);
    };

    const handleShowLogs = async (id: number) => {
        setShowLogs(id);
        const { data } = await getBackupLogs(id);
        setLogs(data);
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes, i = 0;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return `${size.toFixed(1)} ${units[i]}`;
    };

    const getLogIcon = (level: string) => {
        switch (level) {
            case 'error': return <AlertCircle className="text-red-400" size={14} />;
            case 'warn': return <AlertCircle className="text-yellow-400" size={14} />;
            default: return <Info className="text-blue-400" size={14} />;
        }
    };

    const handleDownload = async (id: number, filename: string) => {
        try {
            const response = await downloadBackup(id);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Download failed', err);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" size={32} /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Backups</h1>
                <div className="flex gap-2">
                    <button onClick={load} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2">
                        <RefreshCw size={20} /> Refresh
                    </button>
                    <button onClick={() => setShowModal(true)} disabled={!nodes.length} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2 disabled:opacity-50">
                        <Plus size={20} /> Create Backup
                    </button>
                </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-slate-800">
                        <tr className="text-left text-slate-400 text-sm">
                            <th className="px-4 py-3">Node</th>
                            <th className="px-4 py-3">Volume</th>
                            <th className="px-4 py-3">Size</th>
                            <th className="px-4 py-3">Storage</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {backups.map((b) => (
                            <tr key={b.id}>
                                <td className="px-4 py-3">{b.node_name || 'Unknown'}</td>
                                <td className="px-4 py-3 text-slate-400">{b.volume_name}</td>
                                <td className="px-4 py-3">{formatSize(b.size)}</td>
                                <td className="px-4 py-3"><span className="px-2 py-1 bg-slate-700 rounded text-xs">{b.storage_type}</span></td>
                                <td className="px-4 py-3">
                                    {(b.status === 'running' || b.status === 'pending') ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-24 bg-slate-700 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 transition-all duration-500"
                                                    style={{ width: `${b.progress || 0}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-slate-400">{b.progress || 0}%</span>
                                        </div>
                                    ) : (
                                        <span className={`px-2 py-1 rounded text-xs ${b.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                            b.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                                            }`}>{b.status}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1">
                                        <button onClick={() => handleShowLogs(b.id)} className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded" title="View Logs">
                                            <FileText size={16} />
                                        </button>
                                        {b.status === 'completed' && (
                                            <button onClick={() => handleDownload(b.id, b.filename)} className="p-2 hover:bg-blue-500/20 text-blue-400 rounded" title="Download">
                                                <Download size={16} />
                                            </button>
                                        )}
                                        <button onClick={() => { if (confirm('Are you sure you want to delete this backup? This action cannot be undone.')) { deleteBackup(b.id).then(load); } }} className="p-2 hover:bg-red-500/20 text-red-400 rounded" title="Delete">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!backups.length && (
                            <tr><td colSpan={7} className="text-center text-slate-500 py-8">No backups yet</td></tr>
                        )}
                    </tbody>
                </table>
            </div>


            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md p-6">
                        <div className="flex justify-between mb-4">
                            <h2 className="text-xl font-semibold">Create Backup</h2>
                            <button onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Node</label>
                                <select value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                                    <option value="">Select node</option>
                                    {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Storage</label>
                                <select value={form.storageType} onChange={(e) => setForm({ ...form, storageType: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                                    <option value="local">💾 Local</option>
                                    <option value="cloud">☁️ Cloud (S3)</option>
                                    <option value="remote">🖥️ Remote (SFTP)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
                            <button onClick={handleCreate} disabled={!form.nodeId || creating} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                                {creating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />} Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Logs Modal */}
            {showLogs && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between mb-4">
                            <h2 className="text-xl font-semibold">Backup Logs</h2>
                            <button onClick={() => { setShowLogs(null); setLogs([]); }}><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-900 rounded-lg p-4 font-mono text-sm space-y-2">
                            {logs.length ? logs.map((log) => (
                                <div key={log.id} className="flex items-start gap-2">
                                    {getLogIcon(log.level)}
                                    <span className="text-slate-500 shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
                                    <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-slate-300'}>
                                        {log.message}
                                    </span>
                                </div>
                            )) : (
                                <p className="text-slate-500 text-center">No logs available</p>
                            )}
                        </div>
                        <button onClick={() => { setShowLogs(null); setLogs([]); }} className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
