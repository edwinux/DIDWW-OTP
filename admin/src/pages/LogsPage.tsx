import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import type { OtpRequest, PaginatedResponse, FilterValues } from '../types';

export default function LogsPage() {
  const [logs, setLogs] = useState<OtpRequest[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ status: '', phone: '', id: '' });
  const [filterValues, setFilterValues] = useState<FilterValues>({ statuses: [], languages: [] });
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<OtpRequest | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (filters.status) params.set('status', filters.status);
      if (filters.phone) params.set('phone', filters.phone);
      if (filters.id) params.set('id', filters.id);

      const response = await api.get<PaginatedResponse<OtpRequest>>(`/admin/logs/otp-requests?${params}`);
      setLogs(response.data.data);
      setPagination(response.data.pagination);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    api.get<FilterValues>('/admin/logs/filters').then(res => setFilterValues(res.data));
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const statusColors: Record<string, string> = {
    delivered: 'badge-success',
    verified: 'badge-success',
    sent: 'badge-success',
    pending: 'badge-warning',
    sending: 'badge-info',
    failed: 'badge-error',
    rejected: 'badge-error',
    expired: 'badge-gray',
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>OTP Logs</h2>

      <div className="card">
        <div className="filters">
          <div className="filter-group">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              {filterValues.statuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">Phone Number</label>
            <input
              type="text"
              className="form-input"
              placeholder="Filter by phone..."
              value={filters.phone}
              onChange={(e) => handleFilterChange('phone', e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label className="form-label">Request ID</label>
            <input
              type="text"
              className="form-input"
              placeholder="Filter by ID..."
              value={filters.id}
              onChange={(e) => handleFilterChange('id', e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label className="form-label">Per Page</label>
            <select
              className="form-select"
              value={pagination.limit}
              onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Channel</th>
                    <th>Fraud Score</th>
                    <th>Country</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="text-sm" style={{ fontFamily: 'monospace' }}>
                        {log.id.substring(0, 8)}...
                      </td>
                      <td>{log.phone}</td>
                      <td>
                        <span className={`badge ${statusColors[log.status] || 'badge-gray'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td>{log.channel || '-'}</td>
                      <td>
                        <span className={log.fraud_score > 50 ? 'text-error' : log.fraud_score > 25 ? 'text-warning' : 'text-success'}>
                          {log.fraud_score}
                        </span>
                      </td>
                      <td>{log.country_code || '-'}</td>
                      <td className="text-sm">{new Date(log.created_at).toLocaleString()}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => setSelectedLog(log)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div className="pagination-info">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
              </div>
              <div className="pagination-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                >
                  Previous
                </button>
                <span className="text-sm" style={{ padding: '0 1rem' }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

function LogDetailModal({ log, onClose }: { log: OtpRequest; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="card-title">Request Details</h3>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
        </div>
        <table>
          <tbody>
            {Object.entries(log).map(([key, value]) => (
              <tr key={key}>
                <td style={{ fontWeight: 500, width: '40%' }}>{key}</td>
                <td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {value === null ? <span className="text-gray">null</span> : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
