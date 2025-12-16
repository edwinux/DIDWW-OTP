import { useState, useEffect } from 'react';
import api from '../services/api';
import type { LogsStats } from '../types';

export default function DashboardPage() {
  const [stats, setStats] = useState<LogsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/logs/stats');
      setStats(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return <div className="card"><div className="text-error">{error}</div></div>;
  }

  const statusColors: Record<string, string> = {
    completed: 'badge-success',
    verified: 'badge-success',
    pending: 'badge-warning',
    calling: 'badge-info',
    answered: 'badge-info',
    failed: 'badge-error',
    expired: 'badge-gray',
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Requests</div>
          <div className="stat-value">{stats?.total.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last 24 Hours</div>
          <div className="stat-value">{stats?.last24h.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Fraud Score</div>
          <div className="stat-value">{stats?.avgFraudScore?.toFixed(1) ?? 'N/A'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Status Breakdown</h3>
        </div>
        <div className="stats-grid">
          {stats?.byStatus && Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="stat-card">
              <div className="stat-label">
                <span className={`badge ${statusColors[status] || 'badge-gray'}`}>{status}</span>
              </div>
              <div className="stat-value">{count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Quick Links</h3>
        </div>
        <div className="flex gap-4">
          <a href="/logs" className="btn btn-primary">View Logs</a>
          <a href="/tester" className="btn btn-secondary">Test OTP</a>
          <a href="/database" className="btn btn-secondary">Browse Database</a>
        </div>
      </div>
    </div>
  );
}
