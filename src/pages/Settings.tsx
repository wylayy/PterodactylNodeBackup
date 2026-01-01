import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '../api';
import { HardDrive, Cloud, Server, CheckCircle, XCircle, Loader2, Bell } from 'lucide-react';
export default function Settings() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const { data } = await getSettings();
        setData(data);
        setLoading(false);
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" size={32} /></div>;

    const storageCards = [
        { key: 'local', label: 'Local Storage', icon: HardDrive, desc: 'Saves backups to local disk', color: 'blue' },
        { key: 'cloud', label: 'Cloud Storage (S3)', icon: Cloud, desc: 'AWS S3, MinIO, Backblaze B2', color: 'purple' },
        { key: 'remote', label: 'Remote Storage (SFTP)', icon: Server, desc: 'Upload via SSH/SFTP', color: 'green' },
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Settings</h1>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Storage Backends</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {storageCards.map(({ key, label, icon: Icon, desc, color }) => {
                        const configured = data?.storageStatus?.[key];
                        return (
                            <div key={key} className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className={`p-2 bg-${color}-500/20 rounded-lg`}>
                                        <Icon className={`text-${color}-400`} size={20} />
                                    </div>
                                    {configured ? <CheckCircle className="text-green-400" size={20} /> : <XCircle className="text-slate-400" size={20} />}
                                </div>
                                <h3 className="font-medium">{label}</h3>
                                <p className="text-sm text-slate-400 mt-1">{desc}</p>
                                <p className="text-xs mt-2">
                                    {configured ? <span className="text-green-400">Configured</span> : <span className="text-slate-500">Not configured</span>}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>


            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Safe Backup Configuration</h2>
                </div>
                <div className="space-y-4">
                    <p className="text-sm text-slate-400">
                        Configure Pterodactyl access to automatically stop/start servers during backup.
                        Requires a <strong>Client API Key</strong>.
                    </p>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        await saveSettings(Object.fromEntries(formData));
                        load();
                        alert('Settings saved!');
                    }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Pterodactyl Panel URL</label>
                                <input
                                    name="ptero_url"
                                    defaultValue={data?.settings?.ptero_url || ''}
                                    placeholder="https://panel.example.com"
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Client API Key</label>
                                <input
                                    name="ptero_key"
                                    defaultValue={data?.settings?.ptero_key || ''}
                                    type="password"
                                    placeholder="ptlc_..."
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg">
                                Save Configuration
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-yellow-500/20 rounded-lg"><Bell className="text-yellow-400" size={20} /></div>
                    <h2 className="text-lg font-semibold">Notification Settings</h2>
                </div>
                <form onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    await saveSettings(Object.fromEntries(formData));
                    load();
                    alert('Notification settings saved!');
                }} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Discord Webhook URL</label>
                        <input
                            name="discord_webhook_url"
                            defaultValue={data?.settings?.discord_webhook_url || ''}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg"
                        />
                        <p className="text-xs text-slate-500 mt-1">Leave empty to disable notifications.</p>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg">
                            Save Configuration
                        </button>
                    </div>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* S3 Configuration */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500/20 rounded-lg"><Cloud className="text-purple-400" size={20} /></div>
                        <h2 className="text-lg font-semibold">Cloud Storage (S3)</h2>
                    </div>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        await saveSettings(Object.fromEntries(formData));
                        load();
                        alert('S3 settings saved!');
                    }} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Endpoint</label>
                            <input name="s3_endpoint" defaultValue={data?.settings?.s3_endpoint || ''} placeholder="s3.amazonaws.com" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Bucket</label>
                            <input name="s3_bucket" defaultValue={data?.settings?.s3_bucket || ''} placeholder="my-backups" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Region</label>
                            <input name="s3_region" defaultValue={data?.settings?.s3_region || 'us-east-1'} className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Access Key</label>
                                <input name="s3_access_key" defaultValue={data?.settings?.s3_access_key || ''} type="password" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Secret Key</label>
                                <input name="s3_secret_key" defaultValue={data?.settings?.s3_secret_key || ''} type="password" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            </div>
                        </div>
                        <button type="submit" className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg mt-2">Save S3 Settings</button>
                    </form>
                </div>

                {/* SFTP Configuration */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-green-500/20 rounded-lg"><Server className="text-green-400" size={20} /></div>
                        <h2 className="text-lg font-semibold">Remote Storage (SFTP)</h2>
                    </div>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        await saveSettings(Object.fromEntries(formData));
                        load();
                        alert('SFTP settings saved!');
                    }} className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm text-slate-400 mb-1">Host</label>
                                <input name="sftp_host" defaultValue={data?.settings?.sftp_host || ''} placeholder="backup.server.com" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Port</label>
                                <input name="sftp_port" defaultValue={data?.settings?.sftp_port || '22'} className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Username</label>
                            <input name="sftp_user" defaultValue={data?.settings?.sftp_user || ''} className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Password</label>
                            <input name="sftp_pass" defaultValue={data?.settings?.sftp_pass || ''} type="password" className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Remote Path</label>
                            <input name="sftp_path" defaultValue={data?.settings?.sftp_path || '/backups'} className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg" />
                        </div>
                        <button type="submit" className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg mt-2">Save SFTP Settings</button>
                    </form>
                </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-2">About</h2>
                <p className="text-slate-400">Pterodactyl Node Backup System v1.0.0</p>
                <p className="text-slate-500 text-sm mt-1">Web dashboard for backing up Pterodactyl/Wings volumes</p>
            </div>
        </div >
    );
}
