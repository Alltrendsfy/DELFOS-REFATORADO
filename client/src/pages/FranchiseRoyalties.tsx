import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  DollarSign, 
  Clock,
  CheckCircle,
  AlertTriangle,
  Calculator,
  Filter,
  ArrowLeft,
  Receipt
} from 'lucide-react';
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
import { Input } from "@/components/ui/input";

interface RoyaltyItem {
  id: string;
  franchise_id: string;
  franchise_name: string;
  period_year: number;
  period_month: number;
  gross_pnl: string;
  fees_deducted: string;
  net_profit: string;
  royalty_percentage: string;
  royalty_amount: string;
  status: 'pending' | 'invoiced' | 'paid' | 'disputed';
  payment_date?: string;
  payment_method?: string;
  payment_reference?: string;
}

interface RoyaltiesData {
  summary: {
    totalPaid: number;
    totalPending: number;
    totalDisputed: number;
  };
  royalties: RoyaltyItem[];
}

export default function FranchiseRoyalties() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRoyalty, setSelectedRoyalty] = useState<RoyaltyItem | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const { data, isLoading } = useQuery<RoyaltiesData>({
    queryKey: ['/api/admin/royalties'],
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/royalties/calculate-all', 'POST', {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/royalties'] });
      toast({ 
        title: t('common.success'), 
        description: `${result.calculated?.length || 0} royalties calculated` 
      });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, payment_method, payment_reference }: { 
      id: string; 
      status: string;
      payment_method?: string;
      payment_reference?: string;
    }) => {
      return apiRequest(`/api/admin/royalties/${id}/status`, 'PATCH', { 
        status, 
        payment_method, 
        payment_reference 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/royalties'] });
      toast({ title: t('common.success') });
      setPaymentDialogOpen(false);
      setSelectedRoyalty(null);
      setPaymentMethod('');
      setPaymentReference('');
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const getLocale = () => {
    switch (language) {
      case 'pt-BR': return 'pt-BR';
      case 'es': return 'es-ES';
      default: return 'en-US';
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'USD' }).format(num);
  };

  const formatPeriod = (year: number, month: number) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />{t('franchiseRoyalties.status.paid')}</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />{t('franchiseRoyalties.status.pending')}</Badge>;
      case 'invoiced':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30"><Receipt className="w-3 h-3 mr-1" />{t('franchiseRoyalties.status.invoiced')}</Badge>;
      case 'disputed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><AlertTriangle className="w-3 h-3 mr-1" />{t('franchiseRoyalties.status.disputed')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredRoyalties = data?.royalties?.filter(r => 
    statusFilter === 'all' || r.status === statusFilter
  ) || [];

  const handleMarkPaid = (royalty: RoyaltyItem) => {
    setSelectedRoyalty(royalty);
    setPaymentDialogOpen(true);
  };

  const confirmPayment = () => {
    if (selectedRoyalty) {
      updateStatusMutation.mutate({
        id: selectedRoyalty.id,
        status: 'paid',
        payment_method: paymentMethod,
        payment_reference: paymentReference,
      });
    }
  };

  const handleDispute = (royalty: RoyaltyItem) => {
    updateStatusMutation.mutate({
      id: royalty.id,
      status: 'disputed',
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/franchise-admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-royalties-title">{t('franchiseRoyalties.title')}</h1>
            <p className="text-muted-foreground" data-testid="text-royalties-subtitle">{t('franchise.subtitle')}</p>
          </div>
        </div>
        <Button 
          onClick={() => calculateMutation.mutate()}
          disabled={calculateMutation.isPending}
          data-testid="button-calculate-all"
        >
          <Calculator className="w-4 h-4 mr-2" />
          {calculateMutation.isPending ? t('common.loading') : t('franchiseRoyalties.calculateAll')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseRoyalties.totalPending')}</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600" data-testid="text-total-pending">
              {formatCurrency(data?.summary?.totalPending || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseRoyalties.totalPaid')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-total-paid">
              {formatCurrency(data?.summary?.totalPaid || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseRoyalties.totalDisputed')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-total-disputed">
              {formatCurrency(data?.summary?.totalDisputed || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>{t('franchiseRoyalties.title')}</CardTitle>
              <CardDescription>{t('franchise.list.description')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('franchise.filter.all')}</SelectItem>
                  <SelectItem value="pending">{t('franchiseRoyalties.status.pending')}</SelectItem>
                  <SelectItem value="invoiced">{t('franchiseRoyalties.status.invoiced')}</SelectItem>
                  <SelectItem value="paid">{t('franchiseRoyalties.status.paid')}</SelectItem>
                  <SelectItem value="disputed">{t('franchiseRoyalties.status.disputed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRoyalties.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('franchise.table.name')}</TableHead>
                  <TableHead>{t('franchiseRoyalties.period')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.netProfit')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.royaltyPct')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.royaltyAmount')}</TableHead>
                  <TableHead>{t('franchise.table.status')}</TableHead>
                  <TableHead className="text-right">{t('franchise.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoyalties.map((royalty) => (
                  <TableRow key={royalty.id} data-testid={`row-royalty-${royalty.id}`}>
                    <TableCell>
                      <div className="font-medium">{royalty.franchise_name}</div>
                    </TableCell>
                    <TableCell>
                      {formatPeriod(royalty.period_year, royalty.period_month)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(royalty.net_profit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(royalty.royalty_percentage).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(royalty.royalty_amount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(royalty.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {royalty.status === 'pending' || royalty.status === 'invoiced' ? (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleMarkPaid(royalty)}
                              data-testid={`button-mark-paid-${royalty.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('franchiseRoyalties.markPaid')}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDispute(royalty)}
                              data-testid={`button-dispute-${royalty.id}`}
                            >
                              <AlertTriangle className="h-4 w-4 mr-1" />
                              {t('franchiseRoyalties.dispute')}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('franchiseRoyalties.noRoyalties')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('franchiseRoyalties.markPaid')}</DialogTitle>
            <DialogDescription>
              {selectedRoyalty && `${selectedRoyalty.franchise_name} - ${formatPeriod(selectedRoyalty.period_year, selectedRoyalty.period_month)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment_method">{t('franchiseRoyalties.paymentMethod')}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="wire">Wire Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_reference">Reference</Label>
              <Input
                id="payment_reference"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Transaction ID or reference"
                data-testid="input-payment-reference"
              />
            </div>
            {selectedRoyalty && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Amount</div>
                <div className="text-2xl font-bold">{formatCurrency(selectedRoyalty.royalty_amount)}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} data-testid="button-cancel-payment">
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={confirmPayment}
              disabled={updateStatusMutation.isPending || !paymentMethod}
              data-testid="button-confirm-payment"
            >
              {updateStatusMutation.isPending ? t('common.loading') : t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
