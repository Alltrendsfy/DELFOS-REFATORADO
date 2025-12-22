import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { useLanguage } from '@/contexts/LanguageContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  Building2, 
  MapPin,
  Calendar,
  FileText,
  CreditCard,
  Users,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Crown,
  UserCog,
  Eye,
  BarChart3,
  Plus,
  MoreHorizontal,
  Trash2,
  UserPlus,
  Loader2,
  Pencil,
  Receipt,
  Key,
  RefreshCw,
  Power,
  PowerOff
} from 'lucide-react';
import { format } from 'date-fns';
import type { Franchise, FranchisePlan } from '@shared/schema';

interface FranchiseUser {
  id: string;
  user_id: string;
  role: string;
  permissions: Record<string, boolean> | null;
  is_active: boolean;
  invited_at: string;
  accepted_at: string | null;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_profile_image: string | null;
}

interface FranchiseOwner {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface ExchangeAccount {
  id: string;
  franchiseId: string;
  exchange: string;
  exchangeLabel: string | null;
  canReadBalance: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  isActive: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  consecutiveErrors: number;
  lastError: string | null;
  createdAt: string;
}

interface FranchiseDetailData extends Franchise {
  plan: FranchisePlan;
  owner: FranchiseOwner | null;
  users: FranchiseUser[];
}

export default function FranchiseDetail() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const franchiseId = params.id;

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('operator');
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  // Exchange Account state
  const [isAddExchangeOpen, setIsAddExchangeOpen] = useState(false);
  const [exchangeFormData, setExchangeFormData] = useState({
    exchange: 'kraken',
    exchangeLabel: '',
    apiKey: '',
    apiSecret: '',
    canTrade: false,
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    cnpj: '',
    tax_id_type: null as 'cpf' | 'cnpj' | null,
    tax_id: '',
    address: '',
    country: 'BRA',
    plan_id: '',
    contract_start: '',
    contract_end: '',
    custom_royalty_percentage: '',
    bank_name: '',
    bank_agency: '',
    bank_account: '',
    pix_key: '',
    // Tax Profile for Trading
    tax_country: '',
    tax_year: '',
    tax_short_term_rate: '',
    tax_long_term_rate: '',
    tax_min_taxable: '',
  });

  const { data: franchise, isLoading, error } = useQuery<FranchiseDetailData>({
    queryKey: ['/api/franchises', franchiseId],
    queryFn: async () => {
      const response = await fetch(`/api/franchises/${franchiseId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch franchise');
      }
      return response.json();
    },
    enabled: !!franchiseId,
  });

  // Exchange accounts query
  const { data: exchangeAccounts, isLoading: isLoadingExchangeAccounts } = useQuery<ExchangeAccount[]>({
    queryKey: ['/api/franchises', franchiseId, 'exchange-accounts'],
    queryFn: async () => {
      const response = await fetch(`/api/franchises/${franchiseId}/exchange-accounts`);
      if (!response.ok) {
        return [];
      }
      return response.json();
    },
    enabled: !!franchiseId,
  });

  // Add exchange account mutation
  const addExchangeMutation = useMutation({
    mutationFn: async (data: typeof exchangeFormData) => {
      return await apiRequest(`/api/franchises/${franchiseId}/exchange-accounts`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId, 'exchange-accounts'] });
      setIsAddExchangeOpen(false);
      setExchangeFormData({ exchange: 'kraken', exchangeLabel: '', apiKey: '', apiSecret: '', canTrade: false });
      toast({ title: t('common.success'), description: 'Exchange account added successfully' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Verify exchange account mutation
  const verifyExchangeMutation = useMutation({
    mutationFn: async (exchange: string) => {
      return await apiRequest(`/api/franchises/${franchiseId}/exchange-accounts/${exchange}/verify`, 'POST');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId, 'exchange-accounts'] });
      if (data.success) {
        toast({ title: t('common.success'), description: 'Exchange credentials verified' });
      } else {
        toast({ title: 'Verification Failed', description: data.message, variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Delete exchange account mutation
  const deleteExchangeMutation = useMutation({
    mutationFn: async (exchange: string) => {
      return await apiRequest(`/api/franchises/${franchiseId}/exchange-accounts/${exchange}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId, 'exchange-accounts'] });
      toast({ title: t('common.success'), description: 'Exchange account removed' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      return await apiRequest(`/api/franchises/${franchiseId}/users`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId] });
      setIsAddUserOpen(false);
      setNewUserEmail('');
      setNewUserRole('operator');
      toast({
        title: t('common.success'),
        description: t('franchise.users.added'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('franchise.users.notFound'),
        variant: 'destructive',
      });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest(`/api/franchises/${franchiseId}/users/${userId}`, 'PATCH', { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId] });
      toast({
        title: t('common.success'),
        description: t('franchise.users.updated'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/franchises/${franchiseId}/users/${userId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId] });
      toast({
        title: t('common.success'),
        description: t('franchise.users.removed'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('franchise.users.cannotRemoveMaster'),
        variant: 'destructive',
      });
    },
  });

  const { data: plans } = useQuery<FranchisePlan[]>({
    queryKey: ['/api/franchise-plans'],
  });

  const updateFranchiseMutation = useMutation({
    mutationFn: async (data: typeof editFormData) => {
      return await apiRequest(`/api/franchises/${franchiseId}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises', franchiseId] });
      setIsEditOpen(false);
      toast({
        title: t('common.success'),
        description: t('franchise.edit.success'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('franchise.edit.error'),
        variant: 'destructive',
      });
    },
  });

  const handleOpenEdit = () => {
    if (franchise) {
      setEditFormData({
        name: franchise.name || '',
        cnpj: franchise.cnpj || '',
        tax_id_type: (franchise.tax_id_type as 'cpf' | 'cnpj' | null) || null,
        tax_id: franchise.tax_id || '',
        address: franchise.address || '',
        country: franchise.country || 'BRA',
        plan_id: franchise.plan_id || '',
        contract_start: franchise.contract_start ? format(new Date(franchise.contract_start), 'yyyy-MM-dd') : '',
        contract_end: franchise.contract_end ? format(new Date(franchise.contract_end), 'yyyy-MM-dd') : '',
        custom_royalty_percentage: franchise.custom_royalty_percentage || '',
        bank_name: franchise.bank_name || '',
        bank_agency: franchise.bank_agency || '',
        bank_account: franchise.bank_account || '',
        pix_key: franchise.pix_key || '',
        // Tax Profile for Trading
        tax_country: franchise.tax_country || '',
        tax_year: franchise.tax_year?.toString() || '',
        tax_short_term_rate: franchise.tax_short_term_rate || '',
        tax_long_term_rate: franchise.tax_long_term_rate || '',
        tax_min_taxable: franchise.tax_min_taxable || '',
      });
      setIsEditOpen(true);
    }
  };

  const handleSaveEdit = () => {
    const payload = { ...editFormData };
    if (payload.country !== 'BRA') {
      payload.tax_id_type = null;
      payload.cnpj = '';
    } else {
      payload.tax_id = '';
      if (!payload.tax_id_type) {
        payload.tax_id_type = 'cnpj';
      }
    }
    updateFranchiseMutation.mutate(payload);
  };

  const handleAddUser = () => {
    if (!newUserEmail.trim()) return;
    addUserMutation.mutate({ email: newUserEmail.trim(), role: newUserRole });
  };

  const handleChangeRole = (userId: string, role: string) => {
    updateUserRoleMutation.mutate({ userId, role });
  };

  const handleRemoveUser = (userId: string) => {
    removeUserMutation.mutate(userId);
  };

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

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'master':
        return <Badge variant="default" className="bg-amber-500"><Crown className="w-3 h-3 mr-1" />{t('franchise.detail.role.master')}</Badge>;
      case 'operator':
        return <Badge variant="outline"><UserCog className="w-3 h-3 mr-1" />{t('franchise.detail.role.operator')}</Badge>;
      case 'analyst':
        return <Badge variant="outline"><Eye className="w-3 h-3 mr-1" />{t('franchise.detail.role.analyst')}</Badge>;
      case 'finance':
        return <Badge variant="outline"><BarChart3 className="w-3 h-3 mr-1" />{t('franchise.detail.role.finance')}</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null, email: string | null) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !franchise) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/franchise-admin">
            <Button variant="ghost" size="icon" data-testid="button-back-to-franchises">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">{t('franchise.detail.notFound')}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('franchise.detail.notFoundDescription')}</p>
            <Link href="/franchise-admin">
              <Button variant="outline" className="mt-4" data-testid="button-return-to-list">
                {t('franchise.detail.backToList')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/franchise-admin">
            <Button variant="ghost" size="icon" data-testid="button-back-to-franchises">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-franchise-name">{franchise.name}</h1>
            <p className="text-muted-foreground">{franchise.cnpj || franchise.tax_id || t('franchise.detail.noTaxId')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(franchise.status, franchise.under_audit)}
          <Button variant="outline" onClick={handleOpenEdit} data-testid="button-edit-franchise">
            <Pencil className="h-4 w-4 mr-2" />
            {t('common.edit')}
          </Button>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('franchise.edit.title')}</DialogTitle>
            <DialogDescription>{t('franchise.edit.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t('franchise.form.name')}</Label>
                <Input
                  id="edit-name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-country">{t('franchise.form.country')}</Label>
                <Select 
                  value={editFormData.country} 
                  onValueChange={(value) => setEditFormData({ ...editFormData, country: value })}
                >
                  <SelectTrigger id="edit-country" data-testid="select-edit-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRA">Brasil</SelectItem>
                    <SelectItem value="USA">United States</SelectItem>
                    <SelectItem value="EUR">Europa</SelectItem>
                    <SelectItem value="OTHER">{t('franchise.form.otherCountry')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editFormData.country === 'BRA' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-tax-id-type">{t('franchise.form.taxIdType')}</Label>
                  <Select 
                    value={editFormData.tax_id_type || 'cnpj'} 
                    onValueChange={(value: 'cpf' | 'cnpj') => setEditFormData({ ...editFormData, tax_id_type: value })}
                  >
                    <SelectTrigger id="edit-tax-id-type" data-testid="select-edit-tax-id-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="cpf">CPF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cnpj">{(editFormData.tax_id_type || 'cnpj') === 'cnpj' ? 'CNPJ' : 'CPF'}</Label>
                  <Input
                    id="edit-cnpj"
                    value={editFormData.cnpj}
                    onChange={(e) => setEditFormData({ ...editFormData, cnpj: e.target.value })}
                    placeholder={(editFormData.tax_id_type || 'cnpj') === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                    data-testid="input-edit-tax-id"
                  />
                </div>
              </div>
            )}

            {editFormData.country !== 'BRA' && (
              <div className="space-y-2">
                <Label htmlFor="edit-tax-id">{t('franchise.form.taxId')}</Label>
                <Input
                  id="edit-tax-id"
                  value={editFormData.tax_id}
                  onChange={(e) => setEditFormData({ ...editFormData, tax_id: e.target.value })}
                  placeholder="Tax ID"
                  data-testid="input-edit-tax-id"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-address">{t('franchise.form.address')}</Label>
              <Input
                id="edit-address"
                value={editFormData.address}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                data-testid="input-edit-address"
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-plan">{t('franchise.table.plan')}</Label>
                <Select 
                  value={editFormData.plan_id} 
                  onValueChange={(value) => setEditFormData({ ...editFormData, plan_id: value })}
                >
                  <SelectTrigger id="edit-plan" data-testid="select-edit-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-royalty">{t('franchise.form.customRoyalty')}</Label>
                <Input
                  id="edit-royalty"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={editFormData.custom_royalty_percentage}
                  onChange={(e) => setEditFormData({ ...editFormData, custom_royalty_percentage: e.target.value })}
                  placeholder={t('franchise.form.useDefaultRoyalty')}
                  data-testid="input-edit-royalty"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-contract-start">{t('franchise.form.contractStart')}</Label>
                <Input
                  id="edit-contract-start"
                  type="date"
                  value={editFormData.contract_start}
                  onChange={(e) => setEditFormData({ ...editFormData, contract_start: e.target.value })}
                  data-testid="input-edit-contract-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contract-end">{t('franchise.form.contractEnd')}</Label>
                <Input
                  id="edit-contract-end"
                  type="date"
                  value={editFormData.contract_end}
                  onChange={(e) => setEditFormData({ ...editFormData, contract_end: e.target.value })}
                  data-testid="input-edit-contract-end"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-base font-medium">{t('franchise.detail.banking')}</Label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-bank-name">{t('franchise.form.bankName')}</Label>
                <Input
                  id="edit-bank-name"
                  value={editFormData.bank_name}
                  onChange={(e) => setEditFormData({ ...editFormData, bank_name: e.target.value })}
                  data-testid="input-edit-bank-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pix-key">PIX</Label>
                <Input
                  id="edit-pix-key"
                  value={editFormData.pix_key}
                  onChange={(e) => setEditFormData({ ...editFormData, pix_key: e.target.value })}
                  data-testid="input-edit-pix-key"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-bank-agency">{t('franchise.detail.agency')}</Label>
                <Input
                  id="edit-bank-agency"
                  value={editFormData.bank_agency}
                  onChange={(e) => setEditFormData({ ...editFormData, bank_agency: e.target.value })}
                  data-testid="input-edit-bank-agency"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-bank-account">{t('franchise.detail.account')}</Label>
                <Input
                  id="edit-bank-account"
                  value={editFormData.bank_account}
                  onChange={(e) => setEditFormData({ ...editFormData, bank_account: e.target.value })}
                  data-testid="input-edit-bank-account"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-base font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                {t('settings.taxProfile') || 'Tax Profile'}
              </Label>
              <p className="text-sm text-muted-foreground">{t('settings.taxProfileDescription') || 'Tax configuration for trading operations'}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-tax-country">{t('settings.taxCountry') || 'Tax Country'}</Label>
                <Select 
                  value={editFormData.tax_country} 
                  onValueChange={(value) => {
                    const presets: Record<string, {short: string, long: string}> = {
                      'BR': { short: '15', long: '15' },
                      'US': { short: '37', long: '20' },
                      'EU': { short: '30', long: '25' },
                      'AE': { short: '0', long: '0' },
                      'SG': { short: '0', long: '0' },
                    };
                    const preset = presets[value];
                    setEditFormData({ 
                      ...editFormData, 
                      tax_country: value,
                      tax_short_term_rate: preset?.short || editFormData.tax_short_term_rate,
                      tax_long_term_rate: preset?.long || editFormData.tax_long_term_rate,
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-edit-tax-country">
                    <SelectValue placeholder={t('settings.selectCountry') || 'Select country'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BR">Brazil (15%)</SelectItem>
                    <SelectItem value="US">United States (20-37%)</SelectItem>
                    <SelectItem value="EU">European Union (25-30%)</SelectItem>
                    <SelectItem value="AE">UAE (0%)</SelectItem>
                    <SelectItem value="SG">Singapore (0%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tax-year">{t('settings.taxYear') || 'Tax Year'}</Label>
                <Select 
                  value={editFormData.tax_year} 
                  onValueChange={(value) => setEditFormData({ ...editFormData, tax_year: value })}
                >
                  <SelectTrigger data-testid="select-edit-tax-year">
                    <SelectValue placeholder={t('settings.selectYear') || 'Select year'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit-tax-short-term">{t('settings.shortTermRate') || 'Short Term Rate (%)'}</Label>
                <Input
                  id="edit-tax-short-term"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={editFormData.tax_short_term_rate}
                  onChange={(e) => setEditFormData({ ...editFormData, tax_short_term_rate: e.target.value })}
                  placeholder="15.00"
                  data-testid="input-edit-tax-short-term"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tax-long-term">{t('settings.longTermRate') || 'Long Term Rate (%)'}</Label>
                <Input
                  id="edit-tax-long-term"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={editFormData.tax_long_term_rate}
                  onChange={(e) => setEditFormData({ ...editFormData, tax_long_term_rate: e.target.value })}
                  placeholder="15.00"
                  data-testid="input-edit-tax-long-term"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tax-min-taxable">{t('settings.minTaxable') || 'Min Taxable (USD)'}</Label>
                <Input
                  id="edit-tax-min-taxable"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editFormData.tax_min_taxable}
                  onChange={(e) => setEditFormData({ ...editFormData, tax_min_taxable: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-edit-tax-min-taxable"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} data-testid="button-cancel-edit">
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={updateFranchiseMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateFranchiseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('franchise.detail.businessInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.form.address')}</p>
                  <p className="text-sm text-muted-foreground">{franchise.address || '-'}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.form.cnpj')} / {t('franchise.form.taxId')}</p>
                  <p className="text-sm text-muted-foreground">
                    {franchise.cnpj || franchise.tax_id || '-'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.form.country')}</p>
                  <p className="text-sm text-muted-foreground">{franchise.country}</p>
                </div>
              </div>
            </div>

            {franchise.owner && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">{t('franchise.table.owner')}</p>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={franchise.owner.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {getInitials(franchise.owner.firstName, franchise.owner.lastName, franchise.owner.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {franchise.owner.firstName} {franchise.owner.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{franchise.owner.email}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('franchise.detail.contractInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.table.plan')}</p>
                  <Badge variant="outline" className="mt-1">{franchise.plan?.name || '-'}</Badge>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.form.contractStart')}</p>
                  <p className="text-sm text-muted-foreground">
                    {franchise.contract_start ? format(new Date(franchise.contract_start), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.form.contractEnd')}</p>
                  <p className="text-sm text-muted-foreground">
                    {franchise.contract_end ? format(new Date(franchise.contract_end), 'dd/MM/yyyy') : t('franchise.detail.autoRenewing')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CreditCard className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.detail.royalty')}</p>
                  <p className="text-sm text-muted-foreground">
                    {franchise.custom_royalty_percentage || franchise.plan?.royalty_percentage || '10'}%
                    {franchise.custom_royalty_percentage && (
                      <span className="text-xs ml-1">({t('franchise.detail.customRate')})</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {(franchise.bank_name || franchise.pix_key) && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">{t('franchise.detail.banking')}</p>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {franchise.bank_name && <p>{franchise.bank_name}</p>}
                    {franchise.bank_agency && franchise.bank_account && (
                      <p>{t('franchise.detail.agency')}: {franchise.bank_agency} | {t('franchise.detail.account')}: {franchise.bank_account}</p>
                    )}
                    {franchise.pix_key && <p>PIX: {franchise.pix_key}</p>}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {franchise.under_audit && franchise.audit_notes && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              {t('franchise.detail.auditNotes')}
            </CardTitle>
            <CardDescription>
              {franchise.audit_started_at && (
                <span>{t('franchise.detail.auditStarted')}: {format(new Date(franchise.audit_started_at), 'dd/MM/yyyy HH:mm')}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{franchise.audit_notes}</p>
          </CardContent>
        </Card>
      )}

      {franchise.status === 'suspended' && franchise.suspended_reason && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              {t('franchise.detail.suspendedReason')}
            </CardTitle>
            <CardDescription>
              {franchise.suspended_at && (
                <span>{t('franchise.detail.suspendedAt')}: {format(new Date(franchise.suspended_at), 'dd/MM/yyyy HH:mm')}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{franchise.suspended_reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Exchange Accounts Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Exchange Accounts
            </CardTitle>
            <CardDescription>
              Manage Kraken API credentials for this franchise ({exchangeAccounts?.length || 0})
            </CardDescription>
          </div>
          <Dialog open={isAddExchangeOpen} onOpenChange={setIsAddExchangeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-exchange">
                <Plus className="h-4 w-4 mr-2" />
                Add Exchange
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Exchange Account</DialogTitle>
                <DialogDescription>
                  Enter your Kraken API credentials. These will be encrypted and stored securely.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="exchange-label">Label (Optional)</Label>
                  <Input
                    id="exchange-label"
                    placeholder="e.g., Kraken Main"
                    value={exchangeFormData.exchangeLabel}
                    onChange={(e) => setExchangeFormData({ ...exchangeFormData, exchangeLabel: e.target.value })}
                    data-testid="input-exchange-label"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Enter your Kraken API Key"
                    value={exchangeFormData.apiKey}
                    onChange={(e) => setExchangeFormData({ ...exchangeFormData, apiKey: e.target.value })}
                    data-testid="input-api-key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-secret">API Secret</Label>
                  <Input
                    id="api-secret"
                    type="password"
                    placeholder="Enter your Kraken API Secret"
                    value={exchangeFormData.apiSecret}
                    onChange={(e) => setExchangeFormData({ ...exchangeFormData, apiSecret: e.target.value })}
                    data-testid="input-api-secret"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="can-trade"
                    checked={exchangeFormData.canTrade}
                    onChange={(e) => setExchangeFormData({ ...exchangeFormData, canTrade: e.target.checked })}
                    data-testid="checkbox-can-trade"
                  />
                  <Label htmlFor="can-trade" className="text-sm font-normal">
                    Enable live trading (caution: real orders will be executed)
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddExchangeOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={() => addExchangeMutation.mutate(exchangeFormData)} 
                  disabled={!exchangeFormData.apiKey || !exchangeFormData.apiSecret || addExchangeMutation.isPending}
                  data-testid="button-confirm-add-exchange"
                >
                  {addExchangeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingExchangeAccounts ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
            </div>
          ) : exchangeAccounts && exchangeAccounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exchangeAccounts.map((account) => (
                  <TableRow key={account.id} data-testid={`row-exchange-${account.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium capitalize">{account.exchange}</span>
                          {account.exchangeLabel && (
                            <span className="text-muted-foreground ml-2">({account.exchangeLabel})</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {account.isActive ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                            <Power className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
                            <PowerOff className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                        {account.isVerified ? (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Unverified
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {account.canReadBalance && (
                          <Badge variant="secondary" className="text-xs">Read</Badge>
                        )}
                        {account.canTrade && (
                          <Badge className="text-xs bg-amber-500">Trade</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {account.lastUsedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(account.lastUsedAt), 'dd/MM/yyyy HH:mm')}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => verifyExchangeMutation.mutate(account.exchange)}
                          disabled={verifyExchangeMutation.isPending}
                          data-testid={`button-verify-${account.exchange}`}
                        >
                          {verifyExchangeMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="ml-1">Verify</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive" data-testid={`button-delete-${account.exchange}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Exchange Account</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove this exchange account? Active campaigns using this account will be unable to execute trades.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => deleteExchangeMutation.mutate(account.exchange)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No exchange accounts configured</p>
              <p className="text-sm mt-1">Add a Kraken API key to enable trading for this franchise</p>
            </div>
          )}
          {exchangeAccounts && exchangeAccounts.some(a => a.consecutiveErrors > 0) && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-600 font-medium">API Errors Detected</p>
              {exchangeAccounts.filter(a => a.lastError).map(a => (
                <p key={a.id} className="text-sm text-muted-foreground mt-1">
                  {a.exchange}: {a.lastError}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('franchise.detail.usersTitle')}
            </CardTitle>
            <CardDescription>
              {t('franchise.detail.usersDescription')} ({franchise.users?.length || 0})
            </CardDescription>
          </div>
          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-user">
                <UserPlus className="h-4 w-4 mr-2" />
                {t('franchise.users.add')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('franchise.users.addTitle')}</DialogTitle>
                <DialogDescription>
                  {t('franchise.users.addDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="user-email">{t('franchise.users.email')}</Label>
                  <Input
                    id="user-email"
                    type="email"
                    placeholder={t('franchise.users.emailPlaceholder')}
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    data-testid="input-user-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-role">{t('franchise.users.selectRole')}</Label>
                  <Select value={newUserRole} onValueChange={setNewUserRole}>
                    <SelectTrigger id="user-role" data-testid="select-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="master">{t('franchise.detail.role.master')}</SelectItem>
                      <SelectItem value="operator">{t('franchise.detail.role.operator')}</SelectItem>
                      <SelectItem value="analyst">{t('franchise.detail.role.analyst')}</SelectItem>
                      <SelectItem value="finance">{t('franchise.detail.role.finance')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleAddUser} 
                  disabled={!newUserEmail.trim() || addUserMutation.isPending}
                  data-testid="button-confirm-add-user"
                >
                  {addUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('franchise.users.addButton')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {franchise.users && franchise.users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('franchise.detail.user')}</TableHead>
                  <TableHead>{t('franchise.detail.role.title')}</TableHead>
                  <TableHead>{t('franchise.detail.userStatus')}</TableHead>
                  <TableHead>{t('franchise.detail.invitedAt')}</TableHead>
                  <TableHead>{t('franchise.detail.acceptedAt')}</TableHead>
                  <TableHead className="text-right">{t('franchise.users.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {franchise.users.map((user) => (
                  <TableRow key={user.id} data-testid={`row-franchise-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.user_profile_image || undefined} />
                          <AvatarFallback>
                            {getInitials(user.user_first_name, user.user_last_name, user.user_email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {user.user_first_name} {user.user_last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.user_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                          <CheckCircle className="w-3 h-3 mr-1" />{t('franchise.detail.active')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/30">
                          <XCircle className="w-3 h-3 mr-1" />{t('franchise.detail.inactive')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(user.invited_at), 'dd/MM/yyyy')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {user.accepted_at ? format(new Date(user.accepted_at), 'dd/MM/yyyy') : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-user-actions-${user.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleChangeRole(user.id, user.role === 'master' ? 'operator' : 'master')}
                            data-testid={`button-change-role-${user.id}`}
                          >
                            <Crown className="h-4 w-4 mr-2" />
                            {t('franchise.users.changeRole')}
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem 
                                onSelect={(e) => e.preventDefault()}
                                className="text-red-600"
                                data-testid={`button-remove-user-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('franchise.users.remove')}
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('franchise.users.remove')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('franchise.users.removeConfirm')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveUser(user.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                  data-testid={`button-confirm-remove-${user.id}`}
                                >
                                  {t('franchise.users.remove')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>{t('franchise.detail.noUsers')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('franchise.detail.history')}
          </CardTitle>
          <CardDescription>{t('franchise.detail.historyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">{t('franchise.detail.created')}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(franchise.created_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            </div>
            {franchise.suspended_at && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-red-500" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.status.suspended')}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(franchise.suspended_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                  {franchise.suspended_reason && (
                    <p className="text-xs text-muted-foreground mt-1">{franchise.suspended_reason}</p>
                  )}
                </div>
              </div>
            )}
            {franchise.audit_started_at && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-amber-500" />
                <div>
                  <p className="text-sm font-medium">{t('franchise.detail.auditStarted')}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(franchise.audit_started_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
              <div>
                <p className="text-sm font-medium">{t('franchise.detail.lastUpdate')}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(franchise.updated_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
