import { useState, useEffect } from 'react';
import { getNodes, createNode, updateNode, deleteNode, testNode } from '../api';
import type { Node as ServerNode } from '../api';
import { Server, Plus, Trash2, Wifi, WifiOff, Loader2, X, Edit } from 'lucide-react';

export default function Nodes() {
    const [nodes, setNodes] = useState<ServerNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [testing, setTesting] = useState<number | null>(null);
    const [editingNode, setEditingNode] = useState<ServerNode | null>(null);

    const initialForm = { name: '', host: '', port: '22', username: 'root', auth_type: 'key', ssh_key_path: '', ssh_password: '', volumes_path: '/var/lib/pterodactyl/volumes' };
    const [form, setForm] = useState(initialForm);

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const { data } = await getNodes();
            setNodes(data);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (node: ServerNode) => {
        setEditingNode(node);
        setForm({
            name: node.name,
            host: node.host,
            port: String(node.port),
            username: node.username,
            auth_type: node.auth_type,
            ssh_key_path: '', // Don't show sensitive paths/keys
            ssh_password: '',
            volumes_path: node.volumes_path || '/var/lib/pterodactyl/volumes'
        });
        setShowModal(true);
    };

    const handleSubmit = async () => {
        const data = { ...form, port: parseInt(form.port) };
        if (editingNode) {
            // Remove empty password/key fields to avoid overwriting with empty
            if (!data.ssh_password) delete (data as any).ssh_password;
            if (!data.ssh_key_path) delete (data as any).ssh_key_path;

            await updateNode(editingNode.id, data);
        } else {
            await createNode(data);
        }
        closeModal();
        load();
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingNode(null);
        setForm(initialForm);
    };

    const handleTest = async (id: number) => {
        setTesting(id);
        await testNode(id);
        load();
        setTesting(null);
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" size={32} /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Nodes</h1>
                <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-2">
                    <Plus size={20} /> Add Node
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nodes.map((node) => (
                    <div key={node.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-purple-500/20 rounded-lg"><Server className="text-purple-400" size={24} /></div>
                                <div>
                                    <h3 className="font-semibold">{node.name}</h3>
                                    <p className="text-sm text-slate-400">{node.host}:{node.port}</p>
                                </div>
                            </div>
                            {node.status === 'online' ? <Wifi className="text-green-400" size={20} /> : <WifiOff className="text-slate-400" size={20} />}
                        </div>
                        <div className="space-y-2 text-sm mb-4">
                            <div className="flex justify-between"><span className="text-slate-400">User</span><span>{node.username}</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Auth</span><span>{node.auth_type === 'key' ? '🔑 Key' : '🔒 Password'}</span></div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleTest(node.id)} disabled={testing === node.id} className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center justify-center gap-2">
                                {testing === node.id ? <Loader2 className="animate-spin" size={16} /> : <Wifi size={16} />} Test
                            </button>
                            <button onClick={() => handleEdit(node)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
                                <Edit size={16} />
                            </button>
                            <button onClick={() => { if (confirm('Are you sure you want to delete this node? This action cannot be undone.')) { deleteNode(node.id).then(load); } }} className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
                {!nodes.length && <p className="col-span-full text-center text-slate-500 py-8">No nodes configured</p>}
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md p-6">
                        <div className="flex justify-between mb-4">
                            <h2 className="text-xl font-semibold">{editingNode ? 'Edit Node' : 'Add Node'}</h2>
                            <button onClick={closeModal}><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            <div className="grid grid-cols-3 gap-3">
                                <input placeholder="Host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="col-span-2 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                                <input placeholder="Port" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            </div>
                            <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            <select value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg">
                                <option value="key">🔑 SSH Key</option>
                                <option value="password">🔒 Password</option>
                            </select>
                            {form.auth_type === 'key' ? (
                                <input placeholder="SSH Key Path" value={form.ssh_key_path} onChange={(e) => setForm({ ...form, ssh_key_path: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            ) : (
                                <input type="password" placeholder="SSH Password" value={form.ssh_password} onChange={(e) => setForm({ ...form, ssh_password: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            )}
                            <input placeholder="Volumes Path" value={form.volumes_path} onChange={(e) => setForm({ ...form, volumes_path: e.target.value })} className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={closeModal} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
                            <button onClick={handleSubmit} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg">{editingNode ? 'Save' : 'Add'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
