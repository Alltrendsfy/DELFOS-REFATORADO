import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, 
  Users, 
  DollarSign, 
  Plus,
  Search,
  Filter,
  Eye,
  Pause,
  Play,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Receipt,
  BarChart3,
  ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Franchise, FranchisePlan } from '@shared/schema';
import { ProtectedRoute } from '@/components/ProtectedRoute';

interface FranchiseWithPlan extends Franchise {
  plan?: FranchisePlan;
  owner?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  userCount?: number;
}

interface FranchiseStats {
  total: number;
  active: number;
  suspended: number;
  underAudit: number;
  terminated: number;
}

export default function FranchiseAdmin() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: franchises, isLoading: franchisesLoading } = useQuery<FranchiseWithPlan[]>({
    queryKey: ['/api/franchises'],
  });

  const { data: plans, isLoading: plansLoading } = useQuery<FranchisePlan[]>({
    queryKey: ['/api/franchise-plans'],
  });

  const stats: FranchiseStats = {
    total: franchises?.length || 0,
    active: franchises?.filter(f => f.status === 'active').length || 0,
    suspended: franchises?.filter(f => f.status === 'suspended').length || 0,
    underAudit: franchises?.filter(f => f.under_audit).length || 0,
    terminated: franchises?.filter(f => f.status === 'terminated').length || 0,
  };

  const filteredFranchises = franchises?.filter(f => {
    const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
    const matchesSearch = !searchTerm || 
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.cnpj?.includes(searchTerm) ||
      f.owner?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest(`/api/franchises/${id}/suspend`, 'POST', { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises'] });
      toast({ title: t('common.success'), description: t('franchise.suspended') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/franchises/${id}/reactivate`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises'] });
      toast({ title: t('common.success'), description: t('franchise.reactivated') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const getStatusBadge = (status: string, underAudit: boolean) => {
    if (underAudit) {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30"><AlertTriangle className="w-3 h-3 mr-1" />{t('franchise.status.audit')}</Badge>;
    }
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />{t('franchise.status.active')}</Badge>;
      case 'suspended':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />{t('franchise.status.suspended')}</Badge>;
      case 'terminated':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />{t('franchise.status.terminated')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (franchisesLoading || plansLoading) {
    return (
      <ProtectedRoute requiredRole="franchisor">
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="franchisor">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-franchise-title">{t('franchise.title')}</h1>
          <p className="text-muted-foreground">{t('franchise.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/franchise-admin/analytics">
            <Button variant="outline" data-testid="button-view-analytics">
              <BarChart3 className="w-4 h-4 mr-2" />
              {t('analytics.title')}
            </Button>
          </Link>
          <Link href="/franchise-admin/royalties">
            <Button variant="outline" data-testid="button-view-royalties">
              <Receipt className="w-4 h-4 mr-2" />
              {t('franchiseRoyalties.title')}
            </Button>
          </Link>
          <Link href="/admin/fraud-alerts">
            <Button variant="outline" data-testid="button-view-fraud-alerts">
              <ShieldAlert className="w-4 h-4 mr-2" />
              {t('nav.fraudAlerts')}
            </Button>
          </Link>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-franchise">
                <Plus className="w-4 h-4 mr-2" />
                {t('franchise.create')}
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-xl">{t('franchise.createTitle')}</DialogTitle>
              <DialogDescription className="text-base">{t('franchise.createDescription')}</DialogDescription>
            </DialogHeader>
            <CreateFranchiseForm 
              plans={plans || []} 
              onSuccess={() => {
                setIsCreateOpen(false);
                queryClient.invalidateQueries({ queryKey: ['/api/franchises'] });
              }}
            />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchise.stats.total')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-franchises">{stats.total}</div>
            <p className="text-xs text-muted-foreground">{t('franchise.stats.registered')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchise.stats.active')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-franchises">{stats.active}</div>
            <p className="text-xs text-muted-foreground">{t('franchise.stats.operating')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchise.stats.suspended')}</CardTitle>
            <Pause className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-suspended-franchises">{stats.suspended}</div>
            <p className="text-xs text-muted-foreground">{t('franchise.stats.paused')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchise.stats.underAudit')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600" data-testid="text-audit-franchises">{stats.underAudit}</div>
            <p className="text-xs text-muted-foreground">{t('franchise.stats.reviewing')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>{t('franchise.list.title')}</CardTitle>
              <CardDescription>{t('franchise.list.description')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('franchise.list.search')}
                  className="pl-8 w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-franchises"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('franchise.filter.all')}</SelectItem>
                  <SelectItem value="active">{t('franchise.filter.active')}</SelectItem>
                  <SelectItem value="suspended">{t('franchise.filter.suspended')}</SelectItem>
                  <SelectItem value="terminated">{t('franchise.filter.terminated')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredFranchises && filteredFranchises.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('franchise.table.name')}</TableHead>
                  <TableHead>{t('franchise.table.plan')}</TableHead>
                  <TableHead>{t('franchise.table.owner')}</TableHead>
                  <TableHead>{t('franchise.table.status')}</TableHead>
                  <TableHead>{t('franchise.table.contract')}</TableHead>
                  <TableHead className="text-right">{t('franchise.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFranchises.map((franchise) => (
                  <TableRow key={franchise.id} data-testid={`row-franchise-${franchise.id}`}>
                    <TableCell>
                      <div className="font-medium">{franchise.name}</div>
                      {franchise.cnpj && <div className="text-sm text-muted-foreground">{franchise.cnpj}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{franchise.plan?.name || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      {franchise.owner ? (
                        <div>
                          <div className="text-sm">{franchise.owner.firstName} {franchise.owner.lastName}</div>
                          <div className="text-xs text-muted-foreground">{franchise.owner.email}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(franchise.status, franchise.under_audit)}</TableCell>
                    <TableCell>
                      {franchise.contract_start && (
                        <div className="text-sm">
                          {format(new Date(franchise.contract_start), 'dd/MM/yyyy')}
                          {franchise.contract_end && (
                            <span className="text-muted-foreground"> - {format(new Date(franchise.contract_end), 'dd/MM/yyyy')}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/franchise-admin/${franchise.id}`}>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            data-testid={`button-view-franchise-${franchise.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {franchise.status === 'active' ? (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => suspendMutation.mutate({ id: franchise.id, reason: 'Admin action' })}
                            data-testid={`button-suspend-franchise-${franchise.id}`}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : franchise.status === 'suspended' ? (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => reactivateMutation.mutate(franchise.id)}
                            data-testid={`button-reactivate-franchise-${franchise.id}`}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('franchise.list.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </ProtectedRoute>
  );
}

interface CreateFranchiseFormProps {
  plans: FranchisePlan[];
  onSuccess: () => void;
}

// Mask functions for CPF and CNPJ
function maskCPF(value: string): string {
  return value.replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .substring(0, 14);
}

function maskCNPJ(value: string): string {
  return value.replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
    .substring(0, 18);
}

function maskTaxId(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 11) return maskCPF(value);
  return maskCNPJ(value);
}

function getTaxIdType(value: string): 'cpf' | 'cnpj' | '' {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return 'cpf';
  if (digits.length === 14) return 'cnpj';
  return '';
}

function CreateFranchiseForm({ plans, onSuccess }: CreateFranchiseFormProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    tax_id_type: '' as 'cpf' | 'cnpj' | '',
    tax_id: '',
    address: '',
    country: 'BRA',
    plan_id: '',
    contract_start: new Date().toISOString().split('T')[0],
    contract_end: '',
    owner_email: '',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      console.log('[Franchise] Submitting franchise creation:', data);
      return apiRequest('/api/franchises', 'POST', data);
    },
    onSuccess: (result) => {
      console.log('[Franchise] Created successfully:', result);
      toast({ title: t('common.success'), description: t('franchise.created') });
      onSuccess();
    },
    onError: (error: any) => {
      console.error('[Franchise] Creation failed:', error);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    console.log('[Franchise] Form submitted with data:', formData);
    
    if (!formData.name) {
      toast({ title: t('common.error'), description: t('franchise.validation.nameRequired'), variant: 'destructive' });
      return;
    }
    if (!formData.plan_id) {
      toast({ title: t('common.error'), description: t('franchise.validation.planRequired'), variant: 'destructive' });
      return;
    }
    
    console.log('[Franchise] Validation passed, calling mutation...');
    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-4">
      <div className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">{t('franchise.form.name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('franchise.form.namePlaceholder')}
              className="h-11"
              data-testid="input-franchise-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan" className="text-sm font-medium">{t('franchise.form.plan')} *</Label>
            <Select 
              value={formData.plan_id} 
              onValueChange={(value) => setFormData({ ...formData, plan_id: value })}
            >
              <SelectTrigger className="h-11" data-testid="select-franchise-plan">
                <SelectValue placeholder={t('franchise.form.selectPlan')} />
              </SelectTrigger>
              <SelectContent>
                {plans.map(plan => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cnpj" className="text-sm font-medium">{t('franchise.form.cpfCnpj')}</Label>
            <Input
              id="cnpj"
              value={formData.cnpj}
              onChange={(e) => {
                const masked = maskTaxId(e.target.value);
                const type = getTaxIdType(masked);
                setFormData({ ...formData, cnpj: masked, tax_id_type: type });
              }}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="h-11"
              data-testid="input-franchise-cnpj"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tax_id" className="text-sm font-medium">{t('franchise.form.taxId')}</Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder={t('franchise.form.taxIdPlaceholder')}
              className="h-11"
              data-testid="input-franchise-taxid"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address" className="text-sm font-medium">{t('franchise.form.address')}</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder={t('franchise.form.addressPlaceholder')}
            className="min-h-[80px] resize-none"
            data-testid="input-franchise-address"
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="country" className="text-sm font-medium">{t('franchise.form.country')}</Label>
            <Select 
              value={formData.country} 
              onValueChange={(value) => setFormData({ ...formData, country: value })}
            >
              <SelectTrigger className="h-11" data-testid="select-franchise-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRA">Brasil</SelectItem>
                <SelectItem value="USA">United States</SelectItem>
                <SelectItem value="PRT">Portugal</SelectItem>
                <SelectItem value="ESP">España</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_start" className="text-sm font-medium">{t('franchise.form.contractStart')}</Label>
            <Input
              id="contract_start"
              type="date"
              value={formData.contract_start}
              onChange={(e) => setFormData({ ...formData, contract_start: e.target.value })}
              className="h-11"
              data-testid="input-contract-start"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_end" className="text-sm font-medium">{t('franchise.form.contractEnd')}</Label>
            <Input
              id="contract_end"
              type="date"
              value={formData.contract_end}
              onChange={(e) => setFormData({ ...formData, contract_end: e.target.value })}
              className="h-11"
              data-testid="input-contract-end"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="owner_email" className="text-sm font-medium">{t('franchise.form.ownerEmail')}</Label>
          <Input
            id="owner_email"
            type="email"
            value={formData.owner_email}
            onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
            placeholder={t('franchise.form.ownerEmailPlaceholder')}
            className="h-11"
            data-testid="input-owner-email"
          />
          <p className="text-sm text-muted-foreground mt-1">{t('franchise.form.ownerEmailHint')}</p>
        </div>
      </div>

      <DialogFooter className="pt-4 border-t">
        <Button 
          type="button"
          size="lg" 
          disabled={createMutation.isPending} 
          data-testid="button-submit-franchise"
          onClick={() => handleSubmit()}
        >
          {createMutation.isPending ? t('common.loading') : t('franchise.form.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}
