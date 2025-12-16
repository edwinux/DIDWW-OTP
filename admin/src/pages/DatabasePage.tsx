import { useState, useEffect } from 'react';
import api from '../services/api';
import type { TableInfo, TableSchema } from '../types';

export default function DatabasePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      fetchTableData();
    }
  }, [selectedTable, pagination.page, pagination.limit]);

  const fetchTables = async () => {
    try {
      const response = await api.get<{ tables: TableInfo[] }>('/admin/db/tables');
      setTables(response.data.tables);
      if (response.data.tables.length > 0) {
        setSelectedTable(response.data.tables[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableData = async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const [schemaRes, dataRes] = await Promise.all([
        api.get<{ schema: TableSchema[] }>(`/admin/db/tables/${selectedTable}`),
        api.get(`/admin/db/query/${selectedTable}?page=${pagination.page}&limit=${pagination.limit}`),
      ]);
      setSchema(schemaRes.data.schema);
      setData(dataRes.data.data);
      setPagination(dataRes.data.pagination);
    } catch (err) {
      console.error('Failed to fetch table data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Database Browser</h2>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Tables</h3>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {tables.map(table => (
            <button
              key={table.name}
              className={`btn ${selectedTable === table.name ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setSelectedTable(table.name);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
            >
              {table.name} ({table.rowCount})
            </button>
          ))}
        </div>
      </div>

      {selectedTable && (
        <>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Schema: {selectedTable}</h3>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Not Null</th>
                    <th>Default</th>
                    <th>Primary Key</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.map(col => (
                    <tr key={col.name}>
                      <td style={{ fontFamily: 'monospace' }}>{col.name}</td>
                      <td>{col.type}</td>
                      <td>{col.notnull ? 'Yes' : 'No'}</td>
                      <td className="text-gray">{col.dflt_value ?? '-'}</td>
                      <td>{col.pk ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Data</h3>
              <select
                className="form-select"
                style={{ width: 'auto' }}
                value={pagination.limit}
                onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
            </div>

            {loading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        {schema.map(col => (
                          <th key={col.name}>{col.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => (
                        <tr key={idx}>
                          {schema.map(col => (
                            <td key={col.name} style={{ fontFamily: 'monospace', fontSize: '0.875rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {formatValue(row[col.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pagination">
                  <div className="pagination-info">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} rows
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
        </>
      )}
    </div>
  );
}
