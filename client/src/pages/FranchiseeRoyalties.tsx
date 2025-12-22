import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Receipt,
  Calendar
} from 'lucide-react';
import { Link } from 'wouter';

interface RoyaltyItem {
  id: string;
  franchise_id: string;
  period_year: number;
  period_month: number;
  gross_pnl: string;
  fees_deducted: string;
  net_profit: string;
  royalty_percentage: string;
  royalty_amount: string;
  status: 'pending' | 'invoiced' | 'paid' | 'disputed';
  paid_at?: string;
  payment_method?: string;
  payment_reference?: string;
}

interface RoyaltiesData {
  totalPaid: number;
  totalPending: number;
  totalDisputed: number;
  lastPayment: string | null;
  royalties: RoyaltyItem[];
}

export default function FranchiseeRoyalties() {
  const { t, language } = useLanguage();

  const { data, isLoading, error } = useQuery<RoyaltiesData>({
    queryKey: ['/api/franchise/royalties'],
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
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

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-destructive opacity-50" />
            <p className="text-muted-foreground">{t('common.error')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const royalties = data?.royalties || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/franchise">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-royalties-title">{t('franchiseRoyalties.title')}</h1>
          <p className="text-muted-foreground" data-testid="text-royalties-subtitle">{t('franchiseeRoyalties.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseRoyalties.totalPending')}</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600" data-testid="text-total-pending">
              {formatCurrency(data?.totalPending || 0)}
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
              {formatCurrency(data?.totalPaid || 0)}
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
              {formatCurrency(data?.totalDisputed || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('franchiseRoyalties.lastPayment')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-last-payment">
              {data?.lastPayment ? formatDate(data.lastPayment) : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('franchiseeRoyalties.history')}</CardTitle>
          <CardDescription>{t('franchiseeRoyalties.historyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {royalties.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('franchiseRoyalties.period')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.grossPnL')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.fees')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.netProfit')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.royaltyPct')}</TableHead>
                  <TableHead className="text-right">{t('franchiseRoyalties.royaltyAmount')}</TableHead>
                  <TableHead>{t('franchise.table.status')}</TableHead>
                  <TableHead>{t('franchiseeRoyalties.paidAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {royalties.map((royalty) => (
                  <TableRow key={royalty.id} data-testid={`row-royalty-${royalty.id}`}>
                    <TableCell className="font-medium">
                      {formatPeriod(royalty.period_year, royalty.period_month)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={parseFloat(royalty.gross_pnl) >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(royalty.gross_pnl)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      -{formatCurrency(royalty.fees_deducted)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={parseFloat(royalty.net_profit) >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(royalty.net_profit)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(royalty.royalty_percentage).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(royalty.royalty_amount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(royalty.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {royalty.paid_at ? formatDate(royalty.paid_at) : '-'}
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
    </div>
  );
}
