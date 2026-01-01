import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(err);
    }
);

export interface Node {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_type: string;
    volumes_path: string;
    status: string;
}

export interface Backup {
    id: number;
    node_id: number;
    node_name: string;
    volume_name: string;
    filename: string;
    size: number;
    storage_type: string;
    status: string;
    progress: number;
    created_at: string;
}

export interface BackupLog {
    id: number;
    backup_id: number;
    level: string;
    message: string;
    created_at: string;
}

export interface Schedule {
    id: number;
    node_id: number;
    node_name: string;
    name: string;
    cron_expression: string;
    storage_type: string;
    retention_count: number;
    enabled: boolean;
    last_run: string;
}

export const login = (u: string, p: string) => api.post('/auth/login', { username: u, password: p });
export const getStats = () => api.get('/stats');
export const getNodes = () => api.get<Node[]>('/nodes');
export const createNode = (data: any) => api.post('/nodes', data);
export const updateNode = (id: number, data: any) => api.patch(`/nodes/${id}`, data);
export const deleteNode = (id: number) => api.delete(`/nodes/${id}`);
export const testNode = (id: number) => api.post(`/nodes/${id}/test`);
export const getVolumes = (id: number) => api.get<string[]>(`/nodes/${id}/volumes`);
export const getBackups = () => api.get<Backup[]>('/backups');
export const getRunningBackups = () => api.get<Backup[]>('/backups/running');
export const createBackup = (data: any) => api.post('/backups', data);
export const deleteBackup = (id: number) => api.delete(`/backups/${id}`);
export const getBackupLogs = (id: number) => api.get<BackupLog[]>(`/backups/${id}/logs`);
export const downloadBackup = (id: number) => api.get(`/backups/${id}/download`, { responseType: 'blob' });
export const getSchedules = () => api.get<Schedule[]>('/schedules');
export const createSchedule = (data: any) => api.post('/schedules', data);
export const updateSchedule = (id: number, data: any) => api.patch(`/schedules/${id}`, data);
export const deleteSchedule = (id: number) => api.delete(`/schedules/${id}`);
export const toggleSchedule = (id: number) => api.patch(`/schedules/${id}/toggle`);
export const runSchedule = (id: number) => api.post(`/schedules/${id}/run`);
export const getSettings = () => api.get('/settings');
export const saveSettings = (data: any) => api.post('/settings', data);

