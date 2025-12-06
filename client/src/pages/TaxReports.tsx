import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Download, TrendingUp, DollarSign, Percent, Calendar } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';

interface TaxSummary {
  taxYear: number;
  tradesCount: number;
  profitableTrades: number;
  totalGrossPnl: number;
  totalNetPnl: number;
  totalTaxOwed: number;
  totalNetAfterTax: number;
  totalFees: number;
  totalSlippage: number;
  totalCosts: number;
  effectiveTaxRate: number;
  countryCode: string;
  regime: string;
}

interface TradeCost {
  id: string;
  trade_id: string;
  portfolio_id: string;
  symbol: string;
  created_at: Date;
  gross_pnl_usd: string;
  net_pnl_usd: string;
  tax_owed_usd: string;
  net_after_tax_usd: string;
  total_fees_usd: string;
  total_slippage_usd: string;
  total_cost_usd: string;
}

export default function TaxReports() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');

  // Fetch user portfolios
  const { data: portfolios } = useQuery<any[]>({
    queryKey: ['/api/portfolios'],
  });

  // Auto-select first portfolio when portfolios load
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolio]);

  // Fetch tax summary
  const { data: taxSummary, isLoading: isLoadingSummary, error: summaryError } = useQuery<TaxSummary>({
    queryKey: ['/api/tax-summary', selectedPortfolio, { year: selectedYear }],
    enabled: !!selectedPortfolio,
  });

  // Fetch trade costs
  const { data: tradeCosts, isLoading: isLoadingCosts, error: costsError } = useQuery<TradeCost[]>({
    queryKey: ['/api/trade-costs', selectedPortfolio],
    enabled: !!selectedPortfolio,
  });

  const handleExportCSV = () => {
    if (!tradeCosts || tradeCosts.length === 0) {
      toast({
        title: language === 'en' ? 'No Data' : language === 'es' ? 'Sin Datos' : 'Sem Dados',
        description: language === 'en' ? 'No trade costs to export' : language === 'es' ? 'No hay costos de operaciones para exportar' : 'Sem custos de operações para exportar',
        variant: 'destructive',
      });
      return;
    }

    const headers = [
      'Date',
      'Portfolio',
      'Symbol',
      'Trade ID',
      'Gross PnL (USD)',
      'Total Fees (USD)',
      'Total Slippage (USD)',
      'Total Cost (USD)',
      'Net PnL (USD)',
      'Tax Owed (USD)',
      'Net After Tax (USD)',
    ];

    const rows = tradeCosts.map(cost => {
      const portfolioName = portfolios?.find(p => p.id === cost.portfolio_id)?.name || cost.portfolio_id;
      return [
        new Date(cost.created_at).toLocaleDateString(),
        `"${portfolioName}"`, // Quote to handle commas in name
        cost.symbol,
        cost.trade_id,
        parseFloat(cost.gross_pnl_usd).toFixed(2),
        parseFloat(cost.total_fees_usd).toFixed(2),
        parseFloat(cost.total_slippage_usd).toFixed(2),
        parseFloat(cost.total_cost_usd).toFixed(2),
        parseFloat(cost.net_pnl_usd).toFixed(2),
        parseFloat(cost.tax_owed_usd).toFixed(2),
        parseFloat(cost.net_after_tax_usd).toFixed(2),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-report-${selectedYear}-${selectedPortfolio}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: language === 'en' ? 'Success' : language === 'es' ? 'Éxito' : 'Sucesso',
      description: language === 'en' ? `Tax report exported: ${tradeCosts.length} trades` : language === 'es' ? `Reporte exportado: ${tradeCosts.length} operaciones` : `Relatório exportado: ${tradeCosts.length} operações`,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-tax-reports">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <Receipt className="w-8 h-8" />
            {language === 'en' && 'Tax Reports'}
            {language === 'es' && 'Reportes Fiscales'}
            {language === 'pt-BR' && 'Relatórios Fiscais'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'en' && 'View trade costs, tax calculations, and export reports for compliance'}
            {language === 'es' && 'Ver costos de operaciones, cálculos fiscales y exportar reportes para cumplimiento'}
            {language === 'pt-BR' && 'Visualize custos de operações, cálculos fiscais e exporte relatórios para conformidade'}
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          disabled={!tradeCosts || tradeCosts.length === 0}
          data-testid="button-export-csv"
        >
          <Download className="w-4 h-4 mr-2" />
          {language === 'en' && 'Export CSV'}
          {language === 'es' && 'Exportar CSV'}
          {language === 'pt-BR' && 'Exportar CSV'}
        </Button>
      </div>

      {/* Filters */}
      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {language === 'en' && 'Portfolio'}
                {language === 'es' && 'Portafolio'}
                {language === 'pt-BR' && 'Portfólio'}
              </label>
              <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
                <SelectTrigger data-testid="select-portfolio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {portfolios?.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`select-portfolio-${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {language === 'en' && 'Tax Year'}
                {language === 'es' && 'Año Fiscal'}
                {language === 'pt-BR' && 'Ano Fiscal'}
              </label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger data-testid="select-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()} data-testid={`select-year-${year}`}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {summaryError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {language === 'en' && 'Failed to load tax summary. Please try again.'}
            {language === 'es' && 'Error al cargar resumen fiscal. Por favor intente nuevamente.'}
            {language === 'pt-BR' && 'Falha ao carregar resumo fiscal. Por favor tente novamente.'}
          </AlertDescription>
        </Alert>
      ) : isLoadingSummary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : taxSummary ? (
        <>
          {/* Tax Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-total-tax">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {language === 'en' && 'Total Tax Owed'}
                  {language === 'es' && 'Impuesto Total'}
                  {language === 'pt-BR' && 'Imposto Total'}
                </CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-tax">
                  {formatCurrency(taxSummary.totalTaxOwed)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {taxSummary.countryCode} - {taxSummary.regime}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-net-pnl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {language === 'en' && 'Net PnL (Before Tax)'}
                  {language === 'es' && 'PnL Neto (Antes Impuesto)'}
                  {language === 'pt-BR' && 'PnL Líquido (Antes Imposto)'}
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-net-pnl">
                  {formatCurrency(taxSummary.totalNetPnl)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {taxSummary.profitableTrades} / {taxSummary.tradesCount} profitable
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-after-tax">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {language === 'en' && 'Net After Tax'}
                  {language === 'es' && 'Neto Después Impuesto'}
                  {language === 'pt-BR' && 'Líquido Após Imposto'}
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-after-tax">
                  {formatCurrency(taxSummary.totalNetAfterTax)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'en' && 'Final profit'}
                  {language === 'es' && 'Ganancia final'}
                  {language === 'pt-BR' && 'Lucro final'}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-effective-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {language === 'en' && 'Effective Tax Rate'}
                  {language === 'es' && 'Tasa Efectiva'}
                  {language === 'pt-BR' && 'Taxa Efetiva'}
                </CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-effective-rate">
                  {taxSummary.effectiveTaxRate.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'en' && 'On net profit'}
                  {language === 'es' && 'Sobre ganancia neta'}
                  {language === 'pt-BR' && 'Sobre lucro líquido'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cost Breakdown */}
          <Card data-testid="card-cost-breakdown">
            <CardHeader>
              <CardTitle>
                {language === 'en' && 'Cost Breakdown'}
                {language === 'es' && 'Desglose de Costos'}
                {language === 'pt-BR' && 'Detalhamento de Custos'}
              </CardTitle>
              <CardDescription>
                {language === 'en' && 'Trading costs and tax calculations for the selected period'}
                {language === 'es' && 'Costos de trading y cálculos fiscales para el período seleccionado'}
                {language === 'pt-BR' && 'Custos de trading e cálculos fiscais para o período selecionado'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    {language === 'en' && 'Gross PnL'}
                    {language === 'es' && 'PnL Bruto'}
                    {language === 'pt-BR' && 'PnL Bruto'}
                  </span>
                  <span className="text-sm font-bold" data-testid="text-gross-pnl">
                    {formatCurrency(taxSummary.totalGrossPnl)}
                  </span>
                </div>
                <Separator />

                <div className="flex justify-between items-center text-muted-foreground">
                  <span className="text-sm">
                    {language === 'en' && 'Exchange Fees'}
                    {language === 'es' && 'Comisiones Exchange'}
                    {language === 'pt-BR' && 'Taxas da Corretora'}
                  </span>
                  <span className="text-sm" data-testid="text-fees">
                    -{formatCurrency(taxSummary.totalFees)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-muted-foreground">
                  <span className="text-sm">
                    {language === 'en' && 'Slippage'}
                    {language === 'es' && 'Deslizamiento'}
                    {language === 'pt-BR' && 'Deslizamento'}
                  </span>
                  <span className="text-sm" data-testid="text-slippage">
                    -{formatCurrency(taxSummary.totalSlippage)}
                  </span>
                </div>
                <Separator />

                <div className="flex justify-between items-center font-medium">
                  <span className="text-sm">
                    {language === 'en' && 'Net PnL (Before Tax)'}
                    {language === 'es' && 'PnL Neto (Antes Impuesto)'}
                    {language === 'pt-BR' && 'PnL Líquido (Antes Imposto)'}
                  </span>
                  <span className="text-sm">
                    {formatCurrency(taxSummary.totalNetPnl)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-destructive">
                  <span className="text-sm">
                    {language === 'en' && 'Tax Owed'}
                    {language === 'es' && 'Impuesto'}
                    {language === 'pt-BR' && 'Imposto'}
                  </span>
                  <span className="text-sm">
                    -{formatCurrency(taxSummary.totalTaxOwed)}
                  </span>
                </div>
                <Separator className="my-2" />

                <div className="flex justify-between items-center font-bold text-lg">
                  <span>
                    {language === 'en' && 'Net After Tax'}
                    {language === 'es' && 'Neto Después Impuesto'}
                    {language === 'pt-BR' && 'Líquido Após Imposto'}
                  </span>
                  <span className={taxSummary.totalNetAfterTax >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {formatCurrency(taxSummary.totalNetAfterTax)}
                  </span>
                </div>
              </div>

              {taxSummary.countryCode === 'BR' && (
                <Alert className="mt-4">
                  <Calendar className="h-4 w-4" />
                  <AlertDescription>
                    {language === 'en' && 'Brazil tax regime: 15% calculated on daily net profit (positive days only). This summary aggregates all trades.'}
                    {language === 'es' && 'Régimen fiscal Brasil: 15% calculado sobre ganancia neta diaria (solo días positivos). Este resumen agrega todas las operaciones.'}
                    {language === 'pt-BR' && 'Regime fiscal Brasil: 15% calculado sobre lucro líquido diário (apenas dias positivos). Este resumo agrega todas as operações.'}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Trade Costs Table */}
          {isLoadingCosts ? (
            <p className="text-sm text-muted-foreground">
              {language === 'en' && 'Loading trade costs...'}
              {language === 'es' && 'Cargando costos de operaciones...'}
              {language === 'pt-BR' && 'Carregando custos de operações...'}
            </p>
          ) : tradeCosts && tradeCosts.length > 0 ? (
            <Card data-testid="card-trade-costs">
              <CardHeader>
                <CardTitle>
                  {language === 'en' && 'Trade Costs Detail'}
                  {language === 'es' && 'Detalle de Costos'}
                  {language === 'pt-BR' && 'Detalhamento de Custos'}
                </CardTitle>
                <CardDescription>
                  {language === 'en' && `${tradeCosts.length} trades in ${selectedYear}`}
                  {language === 'es' && `${tradeCosts.length} operaciones en ${selectedYear}`}
                  {language === 'pt-BR' && `${tradeCosts.length} operações em ${selectedYear}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-trade-costs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">
                          {language === 'en' && 'Date'}
                          {language === 'es' && 'Fecha'}
                          {language === 'pt-BR' && 'Data'}
                        </th>
                        <th className="text-left py-2 px-4">
                          {language === 'en' && 'Symbol'}
                          {language === 'es' && 'Símbolo'}
                          {language === 'pt-BR' && 'Símbolo'}
                        </th>
                        <th className="text-right py-2 px-4">
                          {language === 'en' && 'Gross PnL'}
                          {language === 'es' && 'PnL Bruto'}
                          {language === 'pt-BR' && 'PnL Bruto'}
                        </th>
                        <th className="text-right py-2 px-4">
                          {language === 'en' && 'Fees'}
                          {language === 'es' && 'Comisiones'}
                          {language === 'pt-BR' && 'Taxas'}
                        </th>
                        <th className="text-right py-2 px-4">
                          {language === 'en' && 'Slippage'}
                          {language === 'es' && 'Desliz'}
                          {language === 'pt-BR' && 'Deslize'}
                        </th>
                        <th className="text-right py-2 px-4">
                          {language === 'en' && 'Net PnL'}
                          {language === 'es' && 'PnL Neto'}
                          {language === 'pt-BR' && 'PnL Líquido'}
                        </th>
                        <th className="text-right py-2 px-4">
                          {language === 'en' && 'Tax'}
                          {language === 'es' && 'Impuesto'}
                          {language === 'pt-BR' && 'Imposto'}
                        </th>
                        <th className="text-right py-2 px-4">
                          {language === 'en' && 'After Tax'}
                          {language === 'es' && 'Después Impuesto'}
                          {language === 'pt-BR' && 'Após Imposto'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeCosts.map((cost) => (
                        <tr key={cost.id} className="border-b hover-elevate" data-testid={`row-trade-${cost.id}`}>
                          <td className="py-2 px-4">
                            {new Date(cost.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-4 font-medium">{cost.symbol}</td>
                          <td className="py-2 px-4 text-right">
                            {formatCurrency(parseFloat(cost.gross_pnl_usd))}
                          </td>
                          <td className="py-2 px-4 text-right text-muted-foreground">
                            {formatCurrency(parseFloat(cost.total_fees_usd))}
                          </td>
                          <td className="py-2 px-4 text-right text-muted-foreground">
                            {formatCurrency(parseFloat(cost.total_slippage_usd))}
                          </td>
                          <td className="py-2 px-4 text-right">
                            {formatCurrency(parseFloat(cost.net_pnl_usd))}
                          </td>
                          <td className="py-2 px-4 text-right text-destructive">
                            {formatCurrency(parseFloat(cost.tax_owed_usd))}
                          </td>
                          <td className={`py-2 px-4 text-right font-medium ${parseFloat(cost.net_after_tax_usd) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(parseFloat(cost.net_after_tax_usd))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Alert>
          <AlertDescription>
            {language === 'en' && 'No tax data available for the selected portfolio and year'}
            {language === 'es' && 'No hay datos fiscales disponibles para el portafolio y año seleccionados'}
            {language === 'pt-BR' && 'Sem dados fiscais disponíveis para o portfólio e ano selecionados'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
