import { useState, useEffect } from 'react';
import { getStats } from '../api';
import { Database, HardDrive, Clock, Activity, Loader2 } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadStats = async () => {
        try {
            const { data } = await getStats();
            setStats(data);
        } finally {
            setLoading(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes, i = 0;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return `${size.toFixed(1)} ${units[i]}`;
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" size={32} /></div>;
    }

    const cards = [
        { label: 'Total Backups', value: stats?.total || 0, icon: Database, color: 'blue' },
        { label: 'Nodes', value: stats?.nodes || 0, icon: HardDrive, color: 'purple' },
        { label: 'Schedules', value: stats?.schedules || 0, icon: Clock, color: 'green' },
        { label: 'Total Size', value: formatSize(stats?.total_size || 0), icon: Activity, color: 'orange' },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-slate-400 text-sm">{label}</p>
                                <p className="text-2xl font-bold mt-1">{value}</p>
                            </div>
                            <div className={`p-3 bg-${color}-500/20 rounded-lg`}>
                                <Icon className={`text-${color}-400`} size={24} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="font-semibold">Recent Backups</h2>
                </div>
                <div className="p-4">
                    {stats?.recent?.length ? (
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-slate-400 text-sm">
                                    <th className="pb-3">Node</th>
                                    <th className="pb-3">Volume</th>
                                    <th className="pb-3">Size</th>
                                    <th className="pb-3">Status</th>
                                    <th className="pb-3">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {stats.recent.map((b: any) => (
                                    <tr key={b.id}>
                                        <td className="py-3">{b.node_name || 'Unknown'}</td>
                                        <td className="py-3 text-slate-400">{b.volume_name}</td>
                                        <td className="py-3">{formatSize(b.size)}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded text-xs ${b.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                                    b.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                        'bg-yellow-500/20 text-yellow-400'
                                                }`}>
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="py-3 text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-slate-500 text-center py-8">No backups yet</p>
                    )}
                </div>
            </div>
        </div>
    );
}
