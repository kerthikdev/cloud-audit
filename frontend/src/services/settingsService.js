import apiClient from './apiClient';

// ── AWS Settings ─────────────────────────────────────────────────────────────

export const getSettings = async () => {
    const res = await apiClient.get('/settings');
    return res.data;
};

export const saveAWSCredentials = async (credentials) => {
    const res = await apiClient.post('/settings/aws-credentials', credentials);
    return res.data;
};

export const switchToMock = async () => {
    const res = await apiClient.post('/settings/use-mock');
    return res.data;
};

// ── Schedule ─────────────────────────────────────────────────────────────────

export const getSchedule = async () => {
    const res = await apiClient.get('/settings/schedule');
    return res.data;
};

export const setSchedule = async (cron) => {
    const res = await apiClient.post('/settings/schedule', { cron });
    return res.data;
};

// ── Webhook ──────────────────────────────────────────────────────────────────

export const setWebhook = async (slack_webhook_url) => {
    const res = await apiClient.post('/settings/webhook', { slack_webhook_url });
    return res.data;
};

// ── User Management ──────────────────────────────────────────────────────────

export const listUsers = async () => {
    const res = await apiClient.get('/users');
    return res.data;
};

export const createUser = async (payload) => {
    const res = await apiClient.post('/users', payload);
    return res.data;
};

export const updateUser = async (id, payload) => {
    const res = await apiClient.patch(`/users/${id}`, payload);
    return res.data;
};

export const deleteUser = async (id) => {
    await apiClient.delete(`/users/${id}`);
};
