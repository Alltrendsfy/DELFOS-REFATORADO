import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  Receipt,
  BarChart3,
  PieChart,
  FileText,
  Download,
  Send,
  Ban,
  RefreshCw,
  Calendar,
  Building2,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Filter
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR, es, enUS } from 'date-fns/locale';
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Franchise, FranchisePlan, FranchiseRoyalty } from '@shared/schema';
import { ProtectedRoute } from '@/components/ProtectedRoute';

interface RoyaltiesResponse {
  summary: { totalPaid: number; totalPending: number; totalDisputed: number };
  royalties: (FranchiseRoyalty & { franchise_name?: string; franchise_id?: string })[];
}
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

interface FranchiseWithPlan extends Franchise {
  plan?: FranchisePlan;
}

interface FinancialOverview {
  totalRevenue: number;
  franchiseFeeRevenue: number;
  royaltyRevenue: number;
  activeFranchises: number;
  delinquentFranchises: number;
  coRevenuePercentage: number;
  monthlyGrowth: number;
  pendingPayments: number;
}

interface FranchiseFeeStatus {
  franchiseId: string;
  franchiseName: string;
  planName: string;
  feeAmount: number;
  periodicity: number;
  lastPayment: string | null;
  nextDueDate: string | null;
  status: 'paid' | 'pending' | 'overdue' | 'suspended';
  daysOverdue: number;
}

interface RoyaltyRecord {
  id: string;
  franchiseId: string;
  franchiseName: string;
  period: string;
  grossProfit: number;
  royaltyPercentage: number;
  royaltyAmount: number;
  status: 'pending' | 'invoiced' | 'paid' | 'disputed';
  isCO: boolean;
}

interface DelinquencyRecord {
  franchiseId: string;
  franchiseName: string;
  debtType: 'fee' | 'royalty';
  daysOverdue: number;
  amountDue: number;
  operationalStatus: string;
}

const COLORS = ['#5B9FB5', '#7DD3E8', '#A8B5BD', '#4A8A9E', '#6BC5D9'];

export default function FranchisorFinancial() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [periodFilter, setPeriodFilter] = useState('month');
  const [statusFilter, setStatusFilter] = useState('all');
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedFranchise, setSelectedFranchise] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const getDateLocale = () => {
    switch(language) {
      case 'pt-BR': return ptBR;
      case 'es': return es;
      default: return enUS;
    }
  };

  const { data: franchises, isLoading: franchisesLoading } = useQuery<FranchiseWithPlan[]>({
    queryKey: ['/api/franchises'],
  });

  const { data: royaltiesData, isLoading: royaltiesLoading } = useQuery<RoyaltiesResponse>({
    queryKey: ['/api/franchise-royalties'],
  });
  
  const royalties = royaltiesData?.royalties || [];

  const { data: plans } = useQuery<FranchisePlan[]>({
    queryKey: ['/api/franchise-plans'],
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest(`/api/franchises/${id}/suspend`, 'POST', { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchises'] });
      toast({ title: t('common.success'), description: t('franchisorFinancial.franchiseSuspended') });
      setSuspendDialogOpen(false);
      setSuspendReason('');
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
      toast({ title: t('common.success'), description: t('franchisorFinancial.franchiseReactivated') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const { data: pendingOnboardings, isLoading: onboardingsLoading } = useQuery<any[]>({
    queryKey: ['/api/franchise-onboarding/pending'],
  });

  const approveMutation = useMutation({
    mutationFn: async (franchiseId: string) => {
      return apiRequest(`/api/franchise-onboarding/${franchiseId}/approve`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-onboarding/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/franchises'] });
      toast({ title: t('common.success'), description: 'Franquia aprovada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ franchiseId, reason }: { franchiseId: string; reason: string }) => {
      return apiRequest(`/api/franchise-onboarding/${franchiseId}/reject`, 'POST', { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-onboarding/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/franchises'] });
      toast({ title: t('common.success'), description: 'Franquia rejeitada' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async ({ franchiseId, paymentMethod }: { franchiseId: string; paymentMethod: string }) => {
      return apiRequest(`/api/franchise-onboarding/${franchiseId}/confirm-payment`, 'POST', { 
        payment_method: paymentMethod,
        payment_reference: `MANUAL-${Date.now()}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-onboarding/pending'] });
      toast({ title: t('common.success'), description: 'Pagamento confirmado' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const { data: feesData, isLoading: feesLoading } = useQuery<{ fees: any[]; summary: any }>({
    queryKey: ['/api/franchise-fees'],
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: any[]; summary: any }>({
    queryKey: ['/api/franchise-invoices'],
  });

  const updateRoyaltyStatusMutation = useMutation({
    mutationFn: async ({ royaltyId, status, payment_method, payment_reference }: { royaltyId: string; status: string; payment_method?: string; payment_reference?: string }) => {
      return apiRequest(`/api/admin/royalties/${royaltyId}/status`, 'PATCH', { status, payment_method, payment_reference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-royalties'] });
      toast({ title: t('common.success'), description: 'Status atualizado' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const updateFeeStatusMutation = useMutation({
    mutationFn: async ({ feeId, status, payment_method, payment_reference }: { feeId: string; status: string; payment_method?: string; payment_reference?: string }) => {
      return apiRequest(`/api/franchise-fees/${feeId}/status`, 'PATCH', { status, payment_method, payment_reference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-fees'] });
      toast({ title: t('common.success'), description: 'Status da taxa atualizado' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async ({ franchise_id, royalty_ids }: { franchise_id: string; royalty_ids: string[] }) => {
      return apiRequest('/api/franchise-invoices/generate', 'POST', { franchise_id, royalty_ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-royalties'] });
      toast({ title: t('common.success'), description: 'Fatura gerada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: async ({ invoiceId, status, payment_method, payment_reference }: { invoiceId: string; status: string; payment_method?: string; payment_reference?: string }) => {
      return apiRequest(`/api/franchise-invoices/${invoiceId}/status`, 'PATCH', { status, payment_method, payment_reference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/franchise-royalties'] });
      toast({ title: t('common.success'), description: 'Status da fatura atualizado' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const fees = feesData?.fees || [];
  const invoices = invoicesData?.invoices || [];

  const calculateOverview = (): FinancialOverview => {
    if (!franchises || royalties.length === 0) {
      return {
        totalRevenue: 0,
        franchiseFeeRevenue: 0,
        royaltyRevenue: 0,
        activeFranchises: franchises?.filter(f => f.status === 'active').length || 0,
        delinquentFranchises: 0,
        coRevenuePercentage: 0,
        monthlyGrowth: 0,
        pendingPayments: 0
      };
    }

    const paidRoyalties = royalties.filter(r => r.status === 'paid');
    const royaltyRevenue = paidRoyalties.reduce((sum, r) => sum + parseFloat(r.royalty_amount || '0'), 0);
    
    const activeFranchises = franchises.filter(f => f.status === 'active').length;
    const suspendedFranchises = franchises.filter(f => f.status === 'suspended').length;
    
    const pendingRoyalties = royalties.filter(r => r.status === 'pending' || r.status === 'invoiced');
    const pendingAmount = pendingRoyalties.reduce((sum, r) => sum + parseFloat(r.royalty_amount || '0'), 0);

    return {
      totalRevenue: royaltyRevenue,
      franchiseFeeRevenue: 0,
      royaltyRevenue,
      activeFranchises,
      delinquentFranchises: suspendedFranchises,
      coRevenuePercentage: 0,
      monthlyGrowth: 0,
      pendingPayments: pendingAmount
    };
  };

  const overview = calculateOverview();

  const getMonthlyData = () => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      
      const monthRoyalties = royalties.filter(r => 
        r.period_month === month && r.period_year === year && r.status === 'paid'
      );
      
      const royaltyTotal = monthRoyalties.reduce((sum, r) => sum + parseFloat(r.royalty_amount || '0'), 0);
      
      months.push({
        month: format(date, 'MMM', { locale: getDateLocale() }),
        royalties: royaltyTotal,
        fees: 0,
        total: royaltyTotal
      });
    }
    return months;
  };

  const getRevenueByPlan = () => {
    if (!franchises || !plans) return [];
    
    return plans.map(plan => {
      const planFranchises = franchises.filter(f => f.plan_id === plan.id);
      return {
        name: plan.name,
        value: planFranchises.length,
        revenue: 0
      };
    }).filter(p => p.value > 0);
  };

  const getFranchiseFeeStatuses = (): FranchiseFeeStatus[] => {
    if (!franchises) return [];
    
    return franchises.map(f => ({
      franchiseId: f.id,
      franchiseName: f.name,
      planName: f.plan?.name || '-',
      feeAmount: 0,
      periodicity: 1,
      lastPayment: null,
      nextDueDate: null,
      status: f.status === 'suspended' ? 'suspended' as const : 'paid' as const,
      daysOverdue: 0
    }));
  };

  const getRoyaltyRecords = (): RoyaltyRecord[] => {
    if (!royalties || !franchises) return [];
    
    return royalties.map(r => {
      const franchise = franchises.find(f => f.id === r.franchise_id);
      return {
        id: r.id,
        franchiseId: r.franchise_id,
        franchiseName: franchise?.name || '-',
        period: `${r.period_month}/${r.period_year}`,
        grossProfit: parseFloat(r.net_profit || '0'),
        royaltyPercentage: parseFloat(r.royalty_percentage || '0'),
        royaltyAmount: parseFloat(r.royalty_amount || '0'),
        status: r.status as 'pending' | 'invoiced' | 'paid' | 'disputed',
        isCO: false
      };
    });
  };

  const getDelinquencyRecords = (): DelinquencyRecord[] => {
    if (!franchises || !royalties) return [];
    
    const records: DelinquencyRecord[] = [];
    
    const pendingRoyalties = royalties.filter(r => r.status === 'pending' || r.status === 'invoiced');
    for (const r of pendingRoyalties) {
      const franchise = franchises.find(f => f.id === r.franchise_id);
      if (franchise) {
        records.push({
          franchiseId: franchise.id,
          franchiseName: franchise.name,
          debtType: 'royalty',
          daysOverdue: 0,
          amountDue: parseFloat(r.royalty_amount || '0'),
          operationalStatus: franchise.status
        });
      }
    }
    
    return records;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />{t('franchisorFinancial.status.paid')}</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />{t('franchisorFinancial.status.pending')}</Badge>;
      case 'overdue':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><AlertTriangle className="w-3 h-3 mr-1" />{t('franchisorFinancial.status.overdue')}</Badge>;
      case 'invoiced':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30"><FileText className="w-3 h-3 mr-1" />{t('franchisorFinancial.status.invoiced')}</Badge>;
      case 'suspended':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><Ban className="w-3 h-3 mr-1" />{t('franchisorFinancial.status.suspended')}</Badge>;
      case 'disputed':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30"><AlertTriangle className="w-3 h-3 mr-1" />{t('franchisorFinancial.status.disputed')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(language === 'pt-BR' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: language === 'pt-BR' ? 'BRL' : 'USD'
    }).format(value);
  };

  const handleSuspendFranchise = (franchiseId: string) => {
    setSelectedFranchise(franchiseId);
    setSuspendDialogOpen(true);
  };

  const confirmSuspend = () => {
    if (selectedFranchise) {
      suspendMutation.mutate({ id: selectedFranchise, reason: suspendReason || 'Inadimplência' });
    }
  };

  return (
    <ProtectedRoute requiredRole="franchisor">
      {franchisesLoading || royaltiesLoading ? (
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-financial-title">
            {t('franchisorFinancial.title')}
          </h1>
          <p className="text-muted-foreground">{t('franchisorFinancial.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-36" data-testid="select-period-filter">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t('franchisorFinancial.period.month')}</SelectItem>
              <SelectItem value="quarter">{t('franchisorFinancial.period.quarter')}</SelectItem>
              <SelectItem value="year">{t('franchisorFinancial.period.year')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" data-testid="button-export-report">
            <Download className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.exportReport')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchisorFinancial.kpi.totalRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">
              {formatCurrency(overview.totalRevenue)}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              {overview.monthlyGrowth >= 0 ? (
                <ArrowUpRight className="w-3 h-3 text-green-500 mr-1" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-red-500 mr-1" />
              )}
              <span className={overview.monthlyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                {overview.monthlyGrowth.toFixed(1)}%
              </span>
              <span className="ml-1">{t('franchisorFinancial.vsLastMonth')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchisorFinancial.kpi.royalties')}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-600" data-testid="text-royalty-revenue">
              {formatCurrency(overview.royaltyRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">{t('franchisorFinancial.fromPerformance')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchisorFinancial.kpi.activeFranchises')}</CardTitle>
            <Building2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-active-franchises">
              {overview.activeFranchises}
            </div>
            <p className="text-xs text-muted-foreground">{t('franchisorFinancial.operating')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchisorFinancial.kpi.delinquent')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-delinquent-franchises">
              {overview.delinquentFranchises}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(overview.pendingPayments)} {t('franchisorFinancial.pending')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.tabs.overview')}
          </TabsTrigger>
          <TabsTrigger value="fees" data-testid="tab-fees">
            <Receipt className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.tabs.fees')}
          </TabsTrigger>
          <TabsTrigger value="royalties" data-testid="tab-royalties">
            <Percent className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.tabs.royalties')}
          </TabsTrigger>
          <TabsTrigger value="delinquency" data-testid="tab-delinquency">
            <AlertTriangle className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.tabs.delinquency')}
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            <FileText className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.tabs.invoices')}
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <PieChart className="w-4 h-4 mr-2" />
            {t('franchisorFinancial.tabs.reports')}
          </TabsTrigger>
          <TabsTrigger value="onboarding" data-testid="tab-onboarding">
            <Users className="w-4 h-4 mr-2" />
            Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('franchisorFinancial.charts.monthlyEvolution')}</CardTitle>
                <CardDescription>{t('franchisorFinancial.charts.revenueByMonth')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getMonthlyData()}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="royalties" 
                      name={t('franchisorFinancial.charts.royalties')}
                      stroke="#7DD3E8" 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="fees" 
                      name={t('franchisorFinancial.charts.fees')}
                      stroke="#5B9FB5" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('franchisorFinancial.charts.revenueByPlan')}</CardTitle>
                <CardDescription>{t('franchisorFinancial.charts.distributionByPlan')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPie>
                    <Pie
                      data={getRevenueByPlan()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getRevenueByPlan().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('franchisorFinancial.charts.revenueBreakdown')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={getMonthlyData()}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Bar dataKey="fees" name={t('franchisorFinancial.charts.fees')} fill="#5B9FB5" />
                  <Bar dataKey="royalties" name={t('franchisorFinancial.charts.royalties')} fill="#7DD3E8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="space-y-4">
          {feesLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-40" /></CardContent></Card>
          ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>{t('franchisorFinancial.fees.title')}</CardTitle>
                  <CardDescription>{t('franchisorFinancial.fees.description')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {feesData?.summary && (
                    <div className="text-sm text-muted-foreground mr-4">
                      <span className="text-green-600 font-medium">{formatCurrency(feesData.summary.totalReceived)}</span> recebido |{' '}
                      <span className="text-yellow-600 font-medium">{formatCurrency(feesData.summary.totalPending)}</span> pendente
                    </div>
                  )}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40" data-testid="select-fee-status-filter">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('common.all')}</SelectItem>
                      <SelectItem value="paid">{t('franchisorFinancial.status.paid')}</SelectItem>
                      <SelectItem value="pending">{t('franchisorFinancial.status.pending')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('franchisorFinancial.fees.franchise')}</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>{t('franchisorFinancial.fees.amount')}</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>{t('franchisorFinancial.fees.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees
                    .filter((f: any) => statusFilter === 'all' || f.status === statusFilter)
                    .map((fee: any) => (
                    <TableRow key={fee.id} data-testid={`row-fee-${fee.id}`}>
                      <TableCell className="font-medium">{fee.franchise_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {fee.fee_type === 'entry' ? 'Entrada' : fee.fee_type === 'renewal' ? 'Renovação' : fee.fee_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(parseFloat(fee.amount_usd || '0'))}</TableCell>
                      <TableCell>{fee.due_date ? format(new Date(fee.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell>{getStatusBadge(fee.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {fee.status === 'pending' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Marcar como pago"
                              onClick={() => updateFeeStatusMutation.mutate({ feeId: fee.id, status: 'paid', payment_method: 'manual' })}
                              disabled={updateFeeStatusMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {fees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma taxa registrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="royalties" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>{t('franchisorFinancial.royalties.title')}</CardTitle>
                  <CardDescription>{t('franchisorFinancial.royalties.description')}</CardDescription>
                </div>
                {royaltiesData?.summary && (
                  <div className="text-sm text-muted-foreground">
                    <span className="text-green-600 font-medium">{formatCurrency(royaltiesData.summary.totalPaid)}</span> pago |{' '}
                    <span className="text-yellow-600 font-medium">{formatCurrency(royaltiesData.summary.totalPending)}</span> pendente |{' '}
                    <span className="text-red-600 font-medium">{formatCurrency(royaltiesData.summary.totalDisputed)}</span> disputado
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('franchisorFinancial.royalties.franchise')}</TableHead>
                    <TableHead>{t('franchisorFinancial.royalties.period')}</TableHead>
                    <TableHead>{t('franchisorFinancial.royalties.grossProfit')}</TableHead>
                    <TableHead>{t('franchisorFinancial.royalties.percentage')}</TableHead>
                    <TableHead>{t('franchisorFinancial.royalties.amount')}</TableHead>
                    <TableHead>{t('franchisorFinancial.royalties.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {royalties.map((royalty: any) => (
                    <TableRow key={royalty.id} data-testid={`row-royalty-${royalty.id}`}>
                      <TableCell className="font-medium">{royalty.franchise_name || '-'}</TableCell>
                      <TableCell>{royalty.period_month}/{royalty.period_year}</TableCell>
                      <TableCell>{formatCurrency(parseFloat(royalty.net_profit || '0'))}</TableCell>
                      <TableCell>{parseFloat(royalty.royalty_percentage || '0')}%</TableCell>
                      <TableCell className="font-medium text-cyan-600">{formatCurrency(parseFloat(royalty.royalty_amount || '0'))}</TableCell>
                      <TableCell>{getStatusBadge(royalty.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {royalty.status === 'pending' && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Gerar Fatura"
                                onClick={() => generateInvoiceMutation.mutate({ 
                                  franchise_id: royalty.franchise_id, 
                                  royalty_ids: [royalty.id] 
                                })}
                                disabled={generateInvoiceMutation.isPending}
                              >
                                <Receipt className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Marcar como pago"
                                onClick={() => updateRoyaltyStatusMutation.mutate({ 
                                  royaltyId: royalty.id, 
                                  status: 'paid',
                                  payment_method: 'manual'
                                })}
                                disabled={updateRoyaltyStatusMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Marcar como disputado"
                                onClick={() => updateRoyaltyStatusMutation.mutate({ 
                                  royaltyId: royalty.id, 
                                  status: 'disputed'
                                })}
                                disabled={updateRoyaltyStatusMutation.isPending}
                              >
                                <AlertTriangle className="h-4 w-4 text-orange-600" />
                              </Button>
                            </>
                          )}
                          {royalty.status === 'invoiced' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Marcar como pago"
                              onClick={() => updateRoyaltyStatusMutation.mutate({ 
                                royaltyId: royalty.id, 
                                status: 'paid',
                                payment_method: 'manual'
                              })}
                              disabled={updateRoyaltyStatusMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {royalty.status === 'disputed' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Resolver disputa"
                              onClick={() => updateRoyaltyStatusMutation.mutate({ 
                                royaltyId: royalty.id, 
                                status: 'pending'
                              })}
                              disabled={updateRoyaltyStatusMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {royalties.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {t('franchisorFinancial.royalties.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delinquency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('franchisorFinancial.delinquency.title')}</CardTitle>
              <CardDescription>{t('franchisorFinancial.delinquency.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('franchisorFinancial.delinquency.franchise')}</TableHead>
                    <TableHead>{t('franchisorFinancial.delinquency.debtType')}</TableHead>
                    <TableHead>{t('franchisorFinancial.delinquency.daysOverdue')}</TableHead>
                    <TableHead>{t('franchisorFinancial.delinquency.amountDue')}</TableHead>
                    <TableHead>{t('franchisorFinancial.delinquency.operationalStatus')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getDelinquencyRecords().map((record, idx) => (
                    <TableRow key={`${record.franchiseId}-${idx}`} data-testid={`row-delinquency-${record.franchiseId}`}>
                      <TableCell className="font-medium">{record.franchiseName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {record.debtType === 'fee' ? t('franchisorFinancial.delinquency.fee') : t('franchisorFinancial.delinquency.royalty')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={record.daysOverdue > 30 ? 'text-red-600 font-medium' : ''}>
                          {record.daysOverdue} {t('franchisorFinancial.delinquency.days')}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-red-600">{formatCurrency(record.amountDue)}</TableCell>
                      <TableCell>{getStatusBadge(record.operationalStatus)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {record.operationalStatus === 'active' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              title={t('franchisorFinancial.actions.suspend')}
                              onClick={() => handleSuspendFranchise(record.franchiseId)}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                          {record.operationalStatus === 'suspended' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              title={t('franchisorFinancial.actions.reactivate')}
                              onClick={() => reactivateMutation.mutate(record.franchiseId)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {getDelinquencyRecords().length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        {t('franchisorFinancial.delinquency.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoicesLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-40" /></CardContent></Card>
          ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>{t('franchisorFinancial.invoices.title')}</CardTitle>
                  <CardDescription>{t('franchisorFinancial.invoices.description')}</CardDescription>
                </div>
                {invoicesData?.summary && (
                  <div className="text-sm text-muted-foreground">
                    <span className="text-green-600 font-medium">{formatCurrency(invoicesData.summary.totalPaid)}</span> pago |{' '}
                    <span className="text-yellow-600 font-medium">{formatCurrency(invoicesData.summary.totalPending)}</span> pendente |{' '}
                    <span className="text-red-600 font-medium">{formatCurrency(invoicesData.summary.totalOverdue)}</span> vencido
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Nenhuma fatura encontrada</p>
                  <p className="text-sm text-muted-foreground mt-2">Gere faturas a partir da aba de Royalties</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Franquia</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice: any) => (
                      <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                        <TableCell className="font-mono text-sm">{invoice.invoice_number}</TableCell>
                        <TableCell className="font-medium">{invoice.franchise_name || '-'}</TableCell>
                        <TableCell>
                          {invoice.period_start && invoice.period_end ? (
                            `${format(new Date(invoice.period_start), 'MMM/yy', { locale: getDateLocale() })} - ${format(new Date(invoice.period_end), 'MMM/yy', { locale: getDateLocale() })}`
                          ) : '-'}
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(parseFloat(invoice.total_amount || '0'))}</TableCell>
                        <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {invoice.status === 'draft' && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Enviar Fatura"
                                onClick={() => updateInvoiceStatusMutation.mutate({ invoiceId: invoice.id, status: 'sent' })}
                                disabled={updateInvoiceStatusMutation.isPending}
                              >
                                <Send className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Marcar como pago"
                                onClick={() => updateInvoiceStatusMutation.mutate({ 
                                  invoiceId: invoice.id, 
                                  status: 'paid',
                                  payment_method: 'manual'
                                })}
                                disabled={updateInvoiceStatusMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Cancelar"
                                onClick={() => updateInvoiceStatusMutation.mutate({ invoiceId: invoice.id, status: 'cancelled' })}
                                disabled={updateInvoiceStatusMutation.isPending}
                              >
                                <Ban className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {t('franchisorFinancial.reports.title')}
              </CardTitle>
              <CardDescription>
                {t('franchisorFinancial.reports.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="hover-elevate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('franchisorFinancial.reports.revenueByPeriod')}</CardTitle>
                    <CardDescription className="text-sm">{t('franchisorFinancial.reports.revenueByPeriodDesc')}</CardDescription>
                  </CardHeader>
                  <CardFooter className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/revenue-by-period?format=csv', '_blank')}
                      data-testid="button-report-revenue-period-csv"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/revenue-by-period', '_blank')}
                      data-testid="button-report-revenue-period-json"
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="hover-elevate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('franchisorFinancial.reports.revenueByPlan')}</CardTitle>
                    <CardDescription className="text-sm">{t('franchisorFinancial.reports.revenueByPlanDesc')}</CardDescription>
                  </CardHeader>
                  <CardFooter className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/revenue-by-plan?format=csv', '_blank')}
                      data-testid="button-report-revenue-plan-csv"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/revenue-by-plan', '_blank')}
                      data-testid="button-report-revenue-plan-json"
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="hover-elevate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('franchisorFinancial.reports.revenueByFranchise')}</CardTitle>
                    <CardDescription className="text-sm">{t('franchisorFinancial.reports.revenueByFranchiseDesc')}</CardDescription>
                  </CardHeader>
                  <CardFooter className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/revenue-by-franchise?format=csv', '_blank')}
                      data-testid="button-report-revenue-franchise-csv"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/revenue-by-franchise', '_blank')}
                      data-testid="button-report-revenue-franchise-json"
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="hover-elevate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('franchisorFinancial.reports.royaltiesByCampaign')}</CardTitle>
                    <CardDescription className="text-sm">{t('franchisorFinancial.reports.royaltiesByCampaignDesc')}</CardDescription>
                  </CardHeader>
                  <CardFooter className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/royalties-by-campaign?format=csv', '_blank')}
                      data-testid="button-report-royalties-campaign-csv"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/royalties-by-campaign', '_blank')}
                      data-testid="button-report-royalties-campaign-json"
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="hover-elevate">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('franchisorFinancial.reports.delinquencyHistory')}</CardTitle>
                    <CardDescription className="text-sm">{t('franchisorFinancial.reports.delinquencyHistoryDesc')}</CardDescription>
                  </CardHeader>
                  <CardFooter className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/delinquency?format=csv', '_blank')}
                      data-testid="button-report-delinquency-csv"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open('/api/franchise-reports/delinquency', '_blank')}
                      data-testid="button-report-delinquency-json"
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Pedidos de Onboarding Pendentes
              </CardTitle>
              <CardDescription>
                Gerencie as solicitações de novas franquias aguardando aprovação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {onboardingsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !pendingOnboardings || pendingOnboardings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>Nenhum pedido de onboarding pendente</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Franquia</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Taxa</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingOnboardings.map((item: any) => (
                      <TableRow key={item.franchise?.id || item.id} data-testid={`row-onboarding-${item.franchise?.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.franchise?.name || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">{item.franchise?.cnpj || item.franchise?.tax_id || '-'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.plan?.name || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              item.currentStep === 'approval' ? 'default' :
                              item.currentStep === 'payment' ? 'secondary' :
                              'outline'
                            }
                          >
                            {item.currentStep === 'approval' ? 'Aguardando Aprovação' :
                             item.currentStep === 'payment' ? 'Aguardando Pagamento' :
                             item.currentStep === 'contract' ? 'Aguardando Contrato' :
                             item.currentStep}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.fee ? (
                            <div>
                              <div className="font-medium">{formatCurrency(parseFloat(item.fee.amount || '0'))}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.fee.status === 'paid' ? (
                                  <span className="text-green-600">Pago</span>
                                ) : (
                                  <span className="text-yellow-600">Pendente</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Isento</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.franchise?.created_at ? format(new Date(item.franchise.created_at), 'dd/MM/yyyy', { locale: getDateLocale() }) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.currentStep === 'payment' && item.fee?.status !== 'paid' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => confirmPaymentMutation.mutate({ 
                                  franchiseId: item.franchise.id, 
                                  paymentMethod: 'manual' 
                                })}
                                disabled={confirmPaymentMutation.isPending}
                                data-testid={`button-confirm-payment-${item.franchise?.id}`}
                              >
                                <DollarSign className="w-4 h-4 mr-1" />
                                Confirmar Pgto
                              </Button>
                            )}
                            {item.currentStep === 'approval' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => approveMutation.mutate(item.franchise.id)}
                                  disabled={approveMutation.isPending}
                                  data-testid={`button-approve-${item.franchise?.id}`}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Aprovar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => rejectMutation.mutate({ 
                                    franchiseId: item.franchise.id, 
                                    reason: 'Rejeitado pela franqueadora' 
                                  })}
                                  disabled={rejectMutation.isPending}
                                  data-testid={`button-reject-${item.franchise?.id}`}
                                >
                                  <Ban className="w-4 h-4 mr-1" />
                                  Rejeitar
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estatísticas de Onboarding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {pendingOnboardings?.filter((p: any) => p.currentStep === 'approval').length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Aguardando Aprovação</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {pendingOnboardings?.filter((p: any) => p.currentStep === 'payment').length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Aguardando Pagamento</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {pendingOnboardings?.filter((p: any) => p.currentStep === 'contract').length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Aguardando Contrato</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('franchisorFinancial.suspendDialog.title')}</DialogTitle>
            <DialogDescription>{t('franchisorFinancial.suspendDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="suspend-reason">{t('franchisorFinancial.suspendDialog.reason')}</Label>
              <Textarea
                id="suspend-reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder={t('franchisorFinancial.suspendDialog.reasonPlaceholder')}
                data-testid="textarea-suspend-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmSuspend}
              disabled={suspendMutation.isPending}
              data-testid="button-confirm-suspend"
            >
              {suspendMutation.isPending ? t('common.loading') : t('franchisorFinancial.suspendDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
      )}
    </ProtectedRoute>
  );
}
