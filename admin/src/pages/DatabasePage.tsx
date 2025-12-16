import { useState, useEffect } from 'react';
import api from '@/services/api';
import type { TableInfo } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Table2, Key, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  pk: boolean;
  defaultValue?: string | null;
}

export default function DatabasePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [columnNames, setColumnNames] = useState<string[]>([]);
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
        api.get<{ columns: ColumnInfo[]; name: string; rowCount: number }>(`/admin/db/tables/${selectedTable}`),
        api.get<{ columns: string[]; data: Record<string, unknown>[]; pagination: typeof pagination }>(`/admin/db/query/${selectedTable}?page=${pagination.page}&limit=${pagination.limit}`),
      ]);
      setColumns(schemaRes.data.columns);
      setColumnNames(dataRes.data.columns);
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

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-4">
      {/* Table Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-primary" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {tables.map(table => (
              <Button
                key={table.name}
                variant={selectedTable === table.name ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedTable(table.name);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="flex items-center gap-2"
              >
                <Table2 className="h-4 w-4" />
                {table.name}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {table.rowCount}
                </Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedTable && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Schema Card */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4 text-muted-foreground" />
                Schema
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="p-4 pt-0 space-y-2">
                  {columns.map(col => (
                    <div
                      key={col.name}
                      className={cn(
                        'p-3 rounded-lg border',
                        col.pk && 'border-primary/50 bg-primary/5'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-sm font-medium">{col.name}</span>
                        {col.pk && (
                          <Badge variant="default" className="text-xs">PK</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-mono">
                          {col.type}
                        </Badge>
                        {col.notNull && (
                          <Badge variant="muted">NOT NULL</Badge>
                        )}
                        {col.defaultValue && (
                          <span className="truncate">= {col.defaultValue}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Data Card */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Data</CardTitle>
              <div className="flex items-center gap-2">
                <Select
                  value={pagination.limit.toString()}
                  onValueChange={(value) => setPagination(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
                >
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                    <SelectItem value="100">100 rows</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={fetchTableData}
                  disabled={loading}
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <>
                  <ScrollArea className="h-[400px]">
                    <div className="min-w-max">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {columnNames.map(colName => (
                              <TableHead key={colName} className="font-mono text-xs whitespace-nowrap">
                                {colName}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.map((row, idx) => (
                            <TableRow key={idx}>
                              {columnNames.map(colName => (
                                <TableCell
                                  key={colName}
                                  className="font-mono text-xs max-w-[200px] truncate"
                                  title={formatValue(row[colName])}
                                >
                                  {row[colName] === null ? (
                                    <span className="text-muted-foreground italic">NULL</span>
                                  ) : (
                                    formatValue(row[colName])
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                          {data.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={columnNames.length}
                                className="h-24 text-center text-muted-foreground"
                              >
                                No data found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>

                  {/* Pagination */}
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {startRecord} to {endRecord} of {pagination.total} rows
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
