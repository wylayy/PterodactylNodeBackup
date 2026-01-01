import { useState, useEffect } from 'react';
import { getSchedules, getNodes, createSchedule, updateSchedule, deleteSchedule, toggleSchedule, runSchedule } from '../api';
import type { Schedule, Node as ServerNode } from '../api';
import { Plus, Trash2, Play, Loader2, X, ToggleLeft, ToggleRight, Edit } from 'lucide-react';

export default function Schedules() {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [nodes, setNodes] = useState<ServerNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

    const initialForm = { name: '', nodeId: '', cronExpression: '0 0 * * *', storageType: 'local', retentionCount: '7' };
    const [form, setForm] = useState(initialForm);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [s, n] = await Promise.all([getSchedules(), getNodes()]);
        setSchedules(s.data);
        setNodes(n.data);
        setLoading(false);
    };

    const handleEdit = (schedule: Schedule) => {
        setEditingSchedule(schedule);
        setForm({
            name: schedule.name,
            nodeId: String(schedule.node_id),
            cronExpression: schedule.cron_expression,
            storageType: schedule.storage_type,
            retentionCount: String(schedule.retention_count),
        });
        setShowModal(true);
    };

    const handleSubmit = async () => {
        const data = {
            name: form.name,
            node_id: parseInt(form.nodeId),
            cron_expression: form.cronExpression,
            storage_type: form.storageType,
            retention_count: parseInt(form.retentionCount),
            enabled: editingSchedule ? editingSchedule.enabled : true,
        };

        if (editingSchedule) {
            await updateSchedule(editingSchedule.id, data);
        } else {
            await createSchedule(data);
        }
        closeModal();
        load();
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingSchedule(null);
        setForm(initialForm);
    };

    const cronPresets = [
        { label: 'Daily at midnight', value: '0 0 * * *' },
        { label: 'Every 6 hours', value: '0 */6 * * *' },
        { label: 'Weekly on Sunday', value: '0 0 * * 0' },
        { label: 'Monthly on 1st', value: '0 0 1 * *' },
    ];

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" size={32} /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Schedules</h1>
                <button onClick={() => setShowModal(true)} disabled={!nodes.length} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2 disabled:opacity-50">
                    <Plus size={20} /> Add Schedule
                </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-slate-800">
                        <tr className="text-left text-slate-400 text-sm">
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Node</th>
                            <th className="px-4 py-3">Cron</th>
                            <th className="px-4 py-3">Storage</th>
                            <th className="px-4 py-3">Retention</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Last Run</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {schedules.map((s) => (
                            <tr key={s.id}>
                                <td className="px-4 py-3 font-medium">{s.name}</td>
                                <td className="px-4 py-3">{s.node_name || 'Unknown'}</td>
                                <td className="px-4 py-3 font-mono text-sm">{s.cron_expression}</td>
                                <td className="px-4 py-3"><span className="px-2 py-1 bg-slate-700 rounded text-xs">{s.storage_type}</span></td>
                                <td className="px-4 py-3">{s.retention_count}</td>
                                <td className="px-4 py-3">
                                    <button onClick={() => { toggleSchedule(s.id); load(); }} className="p-1">
                                        {s.enabled ? <ToggleRight className="text-green-400" size={24} /> : <ToggleLeft className="text-slate-400" size={24} />}
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-slate-400">{s.last_run ? new Date(s.last_run).toLocaleString() : 'Never'}</td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1">
                                        <button onClick={() => runSchedule(s.id)} className="p-2 hover:bg-blue-500/20 text-blue-400 rounded" title="Run now">
                                            <Play size={16} />
                                        </button>
                                        <button onClick={() => handleEdit(s)} className="p-2 hover:bg-slate-700 text-slate-400 rounded" title="Edit">
                                            <Edit size={16} />
                                        </button>
                                        <button onClick={() => { deleteSchedule(s.id); load(); }} className="p-2 hover:bg-red-500/20 text-red-400 rounded">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!schedules.length && (
                            <tr><td colSpan={8} className="text-center text-slate-500 py-8">No schedules configured</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md p-6">
                        <div className="flex justify-between mb-4">
                            <h2 className="text-xl font-semibold">{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</h2>
                            <button onClick={closeModal}><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <input placeholder="Schedule Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            <select value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                                <option value="">Select node</option>
                                {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                            </select>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Cron Expression</label>
                                <input value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg font-mono" />
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {cronPresets.map((p) => (
                                        <button key={p.value} onClick={() => setForm({ ...form, cronExpression: p.value })} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs">{p.label}</button>
                                    ))}
                                </div>
                            </div>
                            <select value={form.storageType} onChange={(e) => setForm({ ...form, storageType: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                                <option value="local">💾 Local</option>
                                <option value="cloud">☁️ Cloud (S3)</option>
                                <option value="remote">🖥️ Remote (SFTP)</option>
                            </select>
                            <input type="number" placeholder="Retention Count" value={form.retentionCount} onChange={(e) => setForm({ ...form, retentionCount: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={closeModal} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
                            <button onClick={handleSubmit} disabled={!form.name || !form.nodeId} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50">{editingSchedule ? 'Save' : 'Add'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
