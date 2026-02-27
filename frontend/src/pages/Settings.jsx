import { useState, useEffect } from 'react';
import {
    Settings as SettingsIcon, Key, Globe, CheckCircle,
    AlertCircle, Eye, EyeOff, RefreshCw, Shield, Zap,
    Bell, Clock, Users, UserPlus, Trash2, UserCheck, UserX,
} from 'lucide-react';
import {
    getSettings, saveAWSCredentials, switchToMock,
    getSchedule, setSchedule as apiSetSchedule, setWebhook,
    listUsers, createUser, updateUser, deleteUser,
} from '../services/settingsService';
import { getUser } from '../services/authService';

const REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1',
    'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
    'ca-central-1', 'sa-east-1',
];

const CRON_PRESETS = [
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Every 12 hours', value: '0 */12 * * *' },
    { label: 'Daily at 2am UTC', value: '0 2 * * *' },
    { label: 'Every Monday 9am', value: '0 9 * * 1' },
    { label: 'Disabled', value: '' },
];

export default function Settings() {
    const [current, setCurrent] = useState(null);
    const [activeTab, setActiveTab] = useState('aws');    // 'aws' | 'schedule' | 'webhook' | 'users'
    const [showSecret, setShowSecret] = useState(false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    // AWS credentials form
    const [form, setForm] = useState({
        aws_access_key_id: '',
        aws_secret_access_key: '',
        aws_region: 'us-east-1',
        scan_regions: ['us-east-1'],
    });

    // Schedule
    const [cronExpr, setCronExpr] = useState('');
    const [schedStatus, setSchedStatus] = useState(null);

    // Webhook
    const [webhookUrl, setWebhookUrl] = useState('');

    // Users
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', email: '', role: 'viewer' });

    const me = getUser();
    const isAdmin = true; // All users have full access

    useEffect(() => {
        getSettings().then(setCurrent).catch(() => { });
        getSchedule().then(s => {
            setSchedStatus(s);
            setCronExpr(s.cron || '');
        }).catch(() => { });
        if (isAdmin) {
            listUsers().then(r => setUsers(r.users || [])).catch(() => { });
        }
    }, []);

    const showToast = (type, message) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 5000);
    };

    const handleRegionToggle = (region) => {
        setForm(f => {
            const has = f.scan_regions.includes(region);
            if (has && f.scan_regions.length === 1) return f;
            return {
                ...f,
                scan_regions: has
                    ? f.scan_regions.filter(r => r !== region)
                    : [...f.scan_regions, region],
            };
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.aws_access_key_id || !form.aws_secret_access_key) {
            showToast('error', 'Access Key and Secret Key are required.');
            return;
        }
        setLoading(true);
        try {
            const result = await saveAWSCredentials(form);
            setCurrent({ mock_aws: false, aws_region: form.aws_region, scan_regions: form.scan_regions, aws_access_key_id_hint: result.key_hint, connected: true });
            showToast('success', `✅ ${result.message}`);
            setForm(f => ({ ...f, aws_access_key_id: '', aws_secret_access_key: '' }));
        } catch (err) {
            showToast('error', `❌ ${err.message || 'Failed to connect. Check your credentials.'}`);
            console.error('[AWS Credentials]', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMock = async () => {
        setLoading(true);
        try {
            await switchToMock();
            setCurrent(c => ({ ...c, mock_aws: true, connected: false, aws_access_key_id_hint: null }));
            showToast('success', 'Switched to Mock Mode');
        } catch {
            showToast('error', 'Failed to switch mode');
        } finally {
            setLoading(false);
        }
    };

    const handleSchedule = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await apiSetSchedule(cronExpr);
            setSchedStatus(s => ({ ...s, cron: cronExpr }));
            showToast('success', cronExpr ? `✅ Schedule set: ${cronExpr}` : '✅ Auto-scan disabled');
        } catch (err) {
            showToast('error', `❌ ${err.response?.data?.detail || 'Failed to save schedule'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleWebhook = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await setWebhook(webhookUrl);
            showToast('success', '✅ Webhook URL saved — alerts will now be posted to Slack');
        } catch (err) {
            showToast('error', `❌ ${err.response?.data?.detail || 'Failed to save webhook'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createUser(newUser);
            showToast('success', `✅ User '${newUser.username}' created`);
            setNewUser({ username: '', password: '', email: '', role: 'viewer' });
            const r = await listUsers();
            setUsers(r.users || []);
        } catch (err) {
            showToast('error', `❌ ${err.response?.data?.detail || 'Failed to create user'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleActive = async (user) => {
        try {
            await updateUser(user.id, { is_active: !user.is_active });
            setUsers(us => us.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
        } catch (err) {
            showToast('error', `❌ ${err.response?.data?.detail || 'Failed to update user'}`);
        }
    };

    const handleDeleteUser = async (user) => {
        if (!window.confirm(`Delete user '${user.username}'?`)) return;
        try {
            await deleteUser(user.id);
            setUsers(us => us.filter(u => u.id !== user.id));
            showToast('success', `User '${user.username}' deleted`);
        } catch (err) {
            showToast('error', `❌ ${err.response?.data?.detail || 'Failed to delete user'}`);
        }
    };

    const TABS = [
        { id: 'aws', label: 'AWS Credentials', icon: Key },
        { id: 'schedule', label: 'Scheduler', icon: Clock },
        { id: 'webhook', label: 'Slack Alerts', icon: Bell },
        { id: 'users', label: 'Users', icon: Users },
    ];

    return (
        <div className="page-content">
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
                    padding: '1rem 1.5rem', borderRadius: '0.75rem', maxWidth: '36rem',
                    background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
                    color: toast.type === 'success' ? '#6ee7b7' : '#fca5a5',
                    backdropFilter: 'blur(8px)', fontSize: '0.9rem',
                }}>
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <SettingsIcon size={28} style={{ marginRight: '0.75rem', color: 'var(--accent)' }} />
                        Settings
                    </h1>
                    <p className="page-subtitle">Configure AWS credentials, scheduling, alerts & user management</p>
                </div>
            </div>

            {/* Status Badge */}
            {current && (
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {current.connected ? <CheckCircle size={20} color="#10b981" /> : <Zap size={20} color="#f59e0b" />}
                            <span style={{ fontWeight: 600, color: current.connected ? '#10b981' : '#f59e0b' }}>
                                {current.mock_aws ? 'Mock Mode (Demo Data)' : 'Connected to AWS'}
                            </span>
                        </div>
                        {current.aws_access_key_id_hint && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                Key: <code>{current.aws_access_key_id_hint}</code>
                            </span>
                        )}
                        {schedStatus?.running && (
                            <span className="badge badge-info">
                                <Clock size={12} style={{ marginRight: 4 }} />
                                Auto-scan: {schedStatus.cron}
                            </span>
                        )}
                        {!current.mock_aws && (
                            <button className="btn btn-sm" onClick={handleMock} disabled={loading}
                                style={{ marginLeft: 'auto', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                                Switch to Mock Mode
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Tab Nav */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.6rem 1rem', background: 'none', border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                            fontWeight: activeTab === tab.id ? 600 : 400,
                            cursor: 'pointer', fontSize: '0.875rem', transition: 'all 0.15s',
                            borderRadius: '0.25rem 0.25rem 0 0', marginBottom: '-1px',
                        }}>
                            <Icon size={15} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── AWS TAB ── */}
            {activeTab === 'aws' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Credentials Form */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title"><Key size={18} style={{ marginRight: '0.5rem' }} />AWS Credentials</h2>
                        </div>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label className="form-label">Access Key ID</label>
                                <input className="form-input" type="text" placeholder="AKIAXXXXXXXXXXXXXXXX"
                                    value={form.aws_access_key_id}
                                    onChange={e => setForm(f => ({ ...f, aws_access_key_id: e.target.value }))}
                                    autoComplete="off" spellCheck={false} />
                            </div>
                            <div>
                                <label className="form-label">Secret Access Key</label>
                                <div style={{ position: 'relative' }}>
                                    <input className="form-input" type={showSecret ? 'text' : 'password'}
                                        placeholder="Your secret access key"
                                        value={form.aws_secret_access_key}
                                        onChange={e => setForm(f => ({ ...f, aws_secret_access_key: e.target.value }))}
                                        autoComplete="new-password" spellCheck={false}
                                        style={{ paddingRight: '3rem' }} />
                                    <button type="button" onClick={() => setShowSecret(s => !s)}
                                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="form-label">Default Region</label>
                                <select className="form-input" value={form.aws_region}
                                    onChange={e => setForm(f => ({ ...f, aws_region: e.target.value }))}>
                                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {loading ? <><RefreshCw size={16} className="spin" /> Validating…</> : <><CheckCircle size={16} /> Connect & Validate</>}
                            </button>
                        </form>
                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <Shield size={14} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                            Credentials are validated via <code>sts:GetCallerIdentity</code> and held in memory only.
                        </div>
                    </div>

                    {/* Regions Selector */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title"><Globe size={18} style={{ marginRight: '0.5rem' }} />Regions to Scan</h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{form.scan_regions.length} selected</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Select the AWS regions to scan. Only selected regions will be audited.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            {REGIONS.map(region => {
                                const active = form.scan_regions.includes(region);
                                return (
                                    <button key={region} type="button" onClick={() => handleRegionToggle(region)}
                                        style={{
                                            padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem',
                                            cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                                            background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                            color: active ? '#a5b4fc' : 'var(--text-muted)',
                                            fontWeight: active ? 600 : 400,
                                        }}>
                                        {active && <CheckCircle size={12} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />}
                                        {region}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: 'rgba(16,185,129,0.06)', borderRadius: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            💡 Only select regions you use to speed up scans.
                        </div>
                    </div>
                </div>
            )}

            {/* ── SCHEDULER TAB ── */}
            {activeTab === 'schedule' && (
                <div style={{ maxWidth: 640 }}>
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title"><Clock size={18} style={{ marginRight: '0.5rem' }} />Automated Scan Schedule</h2>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Set a cron expression to run scans automatically. Leave blank to disable.
                        </p>

                        {/* Presets */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="form-label">Quick Presets</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {CRON_PRESETS.map(p => (
                                    <button key={p.value} type="button"
                                        onClick={() => setCronExpr(p.value)}
                                        style={{
                                            padding: '0.4rem 0.9rem', borderRadius: '0.5rem', fontSize: '0.8rem',
                                            cursor: 'pointer', border: `1px solid ${cronExpr === p.value ? 'var(--accent)' : 'var(--border)'}`,
                                            background: cronExpr === p.value ? 'rgba(99,102,241,0.18)' : 'transparent',
                                            color: cronExpr === p.value ? 'var(--accent)' : 'var(--text-muted)',
                                            transition: 'all 0.15s',
                                        }}>
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <form onSubmit={handleSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label className="form-label">Cron Expression</label>
                                <input className="form-input" type="text"
                                    placeholder="0 */6 * * *  (or leave blank to disable)"
                                    value={cronExpr}
                                    onChange={e => setCronExpr(e.target.value)}
                                    style={{ fontFamily: 'monospace' }} />
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                                    Format: <code>minute hour day month weekday</code>
                                </p>
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}>
                                {loading ? <><RefreshCw size={16} className="spin" /> Saving…</> : <><CheckCircle size={16} /> Save Schedule</>}
                            </button>
                        </form>

                        {schedStatus && (
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.75rem' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                    <strong style={{ color: 'var(--text)' }}>Status:</strong>{' '}
                                    {schedStatus.running ? (
                                        <span style={{ color: '#10b981' }}>● Running — {schedStatus.cron}</span>
                                    ) : (
                                        <span style={{ color: '#f59e0b' }}>○ Disabled</span>
                                    )}
                                </p>
                                {schedStatus.next_run && (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
                                        <strong style={{ color: 'var(--text)' }}>Next run:</strong> {new Date(schedStatus.next_run).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── WEBHOOK TAB ── */}
            {activeTab === 'webhook' && (
                <div style={{ maxWidth: 640 }}>
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title"><Bell size={18} style={{ marginRight: '0.5rem' }} />Slack Alert Notifications</h2>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Post a Slack message whenever CRITICAL or HIGH violations are found during a scan.
                        </p>
                        <form onSubmit={handleWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label className="form-label">Slack Incoming Webhook URL</label>
                                <input className="form-input" type="url"
                                    placeholder="https://hooks.slack.com/services/T.../B.../..."
                                    value={webhookUrl}
                                    onChange={e => setWebhookUrl(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={loading}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {loading ? <><RefreshCw size={16} className="spin" /> Saving…</> : <><Bell size={16} /> Save Webhook</>}
                                </button>
                                {webhookUrl && (
                                    <button type="button" className="btn btn-sm"
                                        onClick={() => setWebhookUrl('')}
                                        style={{ color: 'var(--text-muted)' }}>
                                        Clear
                                    </button>
                                )}
                            </div>
                        </form>
                        <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <strong>How to get a webhook URL:</strong>
                            <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
                                <li>Go to <strong>api.slack.com/apps</strong> → Create App → Incoming Webhooks</li>
                                <li>Enable Incoming Webhooks and click <strong>Add New Webhook to Workspace</strong></li>
                                <li>Choose a channel and copy the Webhook URL</li>
                            </ol>
                        </div>
                    </div>
                </div>
            )}

            {/* ── USERS TAB ── */}
            {activeTab === 'users' && isAdmin && (
                <div>
                    {/* Create user */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <div className="card-header">
                            <h2 className="card-title"><UserPlus size={18} style={{ marginRight: '0.5rem' }} />Create New User</h2>
                        </div>
                        <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                            <div>
                                <label className="form-label">Username</label>
                                <input className="form-input" type="text" placeholder="username" required
                                    value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
                            </div>
                            <div>
                                <label className="form-label">Password</label>
                                <input className="form-input" type="password" placeholder="••••••••" required
                                    value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                            </div>
                            <div>
                                <label className="form-label">Role</label>
                                <select className="form-input" value={newUser.role}
                                    onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
                                    <option value="viewer">Viewer</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div>
                                <button type="submit" className="btn btn-primary" disabled={loading}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                                    <UserPlus size={15} /> Add User
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Users list */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title"><Users size={18} style={{ marginRight: '0.5rem' }} />All Users ({users.length})</h2>
                        </div>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td style={{ fontWeight: 600 }}>{u.username}</td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.email || '—'}</td>
                                            <td>
                                                <span className={`badge ${u.role === 'admin' ? 'badge-danger' : 'badge-info'}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td>
                                                {u.is_active
                                                    ? <span style={{ color: '#10b981', fontSize: 13 }}>● Active</span>
                                                    : <span style={{ color: '#6b7280', fontSize: 13 }}>○ Inactive</span>}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-sm"
                                                        onClick={() => handleToggleActive(u)}
                                                        title={u.is_active ? 'Deactivate' : 'Activate'}
                                                        style={{ padding: '0.25rem 0.5rem' }}>
                                                        {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                                                    </button>
                                                    <button className="btn btn-sm"
                                                        onClick={() => handleDeleteUser(u)}
                                                        title="Delete user"
                                                        style={{ padding: '0.25rem 0.5rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* How-to guide (AWS tab only) */}
            {activeTab === 'aws' && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                    <div className="card-header">
                        <h2 className="card-title">How to Get Your AWS Keys</h2>
                    </div>
                    <ol style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 2, paddingLeft: '1.25rem' }}>
                        <li>Log in to <strong style={{ color: 'var(--text)' }}>AWS Console → IAM → Users → your user</strong></li>
                        <li>Click the <strong style={{ color: 'var(--text)' }}>Security credentials</strong> tab</li>
                        <li>Click <strong style={{ color: 'var(--text)' }}>Create access key</strong> → select "Application running outside AWS"</li>
                        <li>Copy the <strong style={{ color: 'var(--text)' }}>Access Key ID</strong> and <strong style={{ color: 'var(--text)' }}>Secret Access Key</strong></li>
                        <li>Paste them above and click <strong style={{ color: 'var(--accent)' }}>Connect & Validate</strong></li>
                    </ol>
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(239,68,68,0.06)', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#fca5a5' }}>
                        ⚠️ Make sure the IAM user has the <strong>CloudAuditScannerPolicy</strong> attached (from <code>infra/iam-policy.json</code>).
                    </div>
                </div>
            )}
        </div>
    );
}
