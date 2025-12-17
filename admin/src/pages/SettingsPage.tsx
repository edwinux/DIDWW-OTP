import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import type { CallerIdRoute, CallerIdRoutesResponse, CallerIdTestResult } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Phone, MessageSquare, Plus, Pencil, Trash2, RefreshCw, FlaskConical, Check, X } from 'lucide-react';

type Channel = 'sms' | 'voice';

interface RouteFormData {
  prefix: string;
  caller_id: string;
  description: string;
  enabled: boolean;
}

const defaultFormData: RouteFormData = {
  prefix: '',
  caller_id: '',
  description: '',
  enabled: true,
};

export default function SettingsPage() {
  const [routes, setRoutes] = useState<CallerIdRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Channel>('sms');
  const [stats, setStats] = useState({ sms: 0, voice: 0 });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<CallerIdRoute | null>(null);
  const [formData, setFormData] = useState<RouteFormData>(defaultFormData);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<CallerIdRoute | null>(null);

  // Test routing state
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<CallerIdTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<CallerIdRoutesResponse>('/admin/caller-id-routes');
      setRoutes(response.data.data);
      setStats({ sms: response.data.meta.sms, voice: response.data.meta.voice });
    } catch (err) {
      console.error('Failed to fetch routes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const filteredRoutes = routes.filter((r) => r.channel === activeTab);

  const openCreateDialog = () => {
    setEditingRoute(null);
    setFormData(defaultFormData);
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (route: CallerIdRoute) => {
    setEditingRoute(route);
    setFormData({
      prefix: route.prefix,
      caller_id: route.caller_id,
      description: route.description || '',
      enabled: route.enabled === 1,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setFormError('');

    // Validation
    if (!formData.prefix.trim()) {
      setFormError('Prefix is required');
      return;
    }
    if (!formData.caller_id.trim()) {
      setFormError('Caller ID is required');
      return;
    }
    if (activeTab === 'voice' && !/^\d{10,15}$/.test(formData.caller_id)) {
      setFormError('Voice caller ID must be 10-15 digits');
      return;
    }

    setSaving(true);
    try {
      if (editingRoute) {
        await api.put(`/admin/caller-id-routes/${editingRoute.id}`, {
          prefix: formData.prefix,
          caller_id: formData.caller_id,
          description: formData.description || undefined,
          enabled: formData.enabled,
        });
      } else {
        await api.post('/admin/caller-id-routes', {
          channel: activeTab,
          prefix: formData.prefix,
          caller_id: formData.caller_id,
          description: formData.description || undefined,
          enabled: formData.enabled,
        });
      }
      setDialogOpen(false);
      fetchRoutes();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setFormError(error.response?.data?.message || 'Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!routeToDelete) return;
    try {
      await api.delete(`/admin/caller-id-routes/${routeToDelete.id}`);
      setDeleteDialogOpen(false);
      setRouteToDelete(null);
      fetchRoutes();
    } catch (err) {
      console.error('Failed to delete route:', err);
    }
  };

  const handleToggle = async (route: CallerIdRoute) => {
    try {
      await api.post(`/admin/caller-id-routes/${route.id}/toggle`);
      fetchRoutes();
    } catch (err) {
      console.error('Failed to toggle route:', err);
    }
  };

  const handleReloadCache = async () => {
    try {
      await api.post('/admin/caller-id-routes/reload');
      fetchRoutes();
    } catch (err) {
      console.error('Failed to reload cache:', err);
    }
  };

  const handleTestRouting = async () => {
    if (!testPhone.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await api.post<CallerIdTestResult>('/admin/caller-id-routes/test', {
        phone: testPhone,
      });
      setTestResult(response.data);
    } catch (err) {
      console.error('Failed to test routing:', err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure caller ID routing rules</p>
        </div>
        <Button variant="outline" onClick={handleReloadCache}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reload Cache
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Channel)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sms" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS Routes
            <Badge variant="secondary" className="ml-1">{stats.sms}</Badge>
          </TabsTrigger>
          <TabsTrigger value="voice" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Voice Routes
            <Badge variant="secondary" className="ml-1">{stats.voice}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sms" className="mt-4">
          <RouteTable
            routes={filteredRoutes}
            loading={loading}
            channel="sms"
            onAdd={openCreateDialog}
            onEdit={openEditDialog}
            onDelete={(route) => {
              setRouteToDelete(route);
              setDeleteDialogOpen(true);
            }}
            onToggle={handleToggle}
          />
        </TabsContent>

        <TabsContent value="voice" className="mt-4">
          <RouteTable
            routes={filteredRoutes}
            loading={loading}
            channel="voice"
            onAdd={openCreateDialog}
            onEdit={openEditDialog}
            onDelete={(route) => {
              setRouteToDelete(route);
              setDeleteDialogOpen(true);
            }}
            onToggle={handleToggle}
          />
        </TabsContent>
      </Tabs>

      {/* Test Routing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Test Routing
          </CardTitle>
          <CardDescription>
            Enter a phone number to see which caller ID would be used
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs space-y-2">
              <Label htmlFor="test-phone">Phone Number</Label>
              <Input
                id="test-phone"
                placeholder="+66812345678"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestRouting()}
              />
            </div>
            <Button onClick={handleTestRouting} disabled={testing || !testPhone.trim()}>
              {testing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-2" />
              )}
              Test
            </Button>
          </div>

          {testResult && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <TestResultCard
                channel="sms"
                result={testResult.sms}
              />
              <TestResultCard
                channel="voice"
                result={testResult.voice}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRoute ? 'Edit Route' : `Add ${activeTab.toUpperCase()} Route`}
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'voice'
                ? 'Voice caller ID must be 10-15 digits (E.164 format without +)'
                : 'SMS caller ID can be alphanumeric (e.g., "MyBrand") or numeric'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prefix">Prefix</Label>
              <Input
                id="prefix"
                placeholder="66 or * for default"
                value={formData.prefix}
                onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use country code (e.g., 66 for Thailand) or * for default/catchall
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="caller_id">Caller ID</Label>
              <Input
                id="caller_id"
                placeholder={activeTab === 'voice' ? '12125551234' : 'MyBrand or 12125551234'}
                value={formData.caller_id}
                onChange={(e) => setFormData({ ...formData, caller_id: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Thai numbers"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, enabled: checked })}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the route for prefix "{routeToDelete?.prefix}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface RouteTableProps {
  routes: CallerIdRoute[];
  loading: boolean;
  channel: Channel;
  onAdd: () => void;
  onEdit: (route: CallerIdRoute) => void;
  onDelete: (route: CallerIdRoute) => void;
  onToggle: (route: CallerIdRoute) => void;
}

function RouteTable({ routes, loading, channel, onAdd, onEdit, onDelete, onToggle }: RouteTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">
            {channel === 'sms' ? 'SMS' : 'Voice'} Caller ID Routes
          </CardTitle>
          <CardDescription>
            Routes are matched by longest prefix first. Use * for default.
          </CardDescription>
        </div>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Route
        </Button>
      </CardHeader>
      <CardContent>
        {routes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No routes configured for {channel.toUpperCase()} channel.</p>
            <p className="text-sm mt-1">Add a route to enable {channel === 'sms' ? 'SMS' : 'voice'} delivery.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Prefix</TableHead>
                <TableHead>Caller ID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px]">Enabled</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>
                    <code className="px-2 py-1 bg-muted rounded text-sm whitespace-nowrap">
                      {route.prefix === '*' ? '* (default)' : `+${route.prefix}`}
                    </code>
                  </TableCell>
                  <TableCell className="font-mono">{route.caller_id}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {route.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={route.enabled === 1}
                      onCheckedChange={() => onToggle(route)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onEdit(route)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(route)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

interface TestResultCardProps {
  channel: Channel;
  result: { prefix: string; callerId: string } | null;
}

function TestResultCard({ channel, result }: TestResultCardProps) {
  return (
    <div className={`p-4 rounded-lg border ${result ? 'bg-green-500/10 border-green-500/30' : 'bg-destructive/10 border-destructive/30'}`}>
      <div className="flex items-center gap-2 mb-2">
        {channel === 'sms' ? (
          <MessageSquare className="h-4 w-4" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
        <span className="font-medium uppercase">{channel}</span>
        {result ? (
          <Check className="h-4 w-4 text-green-500 ml-auto" />
        ) : (
          <X className="h-4 w-4 text-destructive ml-auto" />
        )}
      </div>
      {result ? (
        <div className="text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Prefix: </span>
            <code className="px-1 bg-muted rounded whitespace-nowrap">{result.prefix === '*' ? '* (default)' : `+${result.prefix}`}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Caller ID: </span>
            <span className="font-mono">{result.callerId}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-destructive">No matching route</p>
      )}
    </div>
  );
}
