import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Scan, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Signal = {
  id: string;
  portfolio_id: string;
  symbol: string;
  signal_type: "long" | "short"; // Changed from 'side'
  
  // Market state at signal generation
  price_at_signal: string; // Changed from 'entry_price'
  ema12: string;
  ema36: string;
  atr: string;
  
  // Config metadata
  signal_config_id: string;
  config_snapshot: any;
  
  // Calculated targets (OCO order levels)
  calculated_tp1: string;
  calculated_tp2: string;
  calculated_sl: string;
  calculated_position_size: string;
  
  // Risk/Circuit Breaker context
  risk_per_trade_bps_used: number;
  circuit_breaker_state: any | null;
  
  // Lifecycle tracking
  status: "pending" | "executed" | "expired" | "cancelled";
  position_id: string | null;
  execution_price: string | null;
  execution_reason: string | null;
  expiration_reason: string | null;
  
  // Timestamps
  generated_at: string;
  executed_at: string | null;
  expired_at: string | null;
};

type Portfolio = {
  id: string;
  name: string;
  balance: string;
};

type ScanSignalsResponse = {
  message: string;
  signalIds: string[];
  signals: Signal[];
};

const translations = {
  en: {
    title: "Trading Signals",
    description: "AI-generated trading signals with ATR-based risk management",
    scanSignals: "Scan for Signals",
    scanning: "Scanning...",
    portfolio: "Portfolio",
    selectPortfolio: "Select portfolio",
    status: "Status",
    allSignals: "All",
    pending: "Pending",
    executed: "Executed",
    expired: "Expired",
    cancelled: "Cancelled",
    noSignals: "No signals found",
    scanToGenerate: "Click 'Scan for Signals' to generate new trading opportunities",
    symbol: "Symbol",
    side: "Side",
    entry: "Entry",
    tp1: "TP1",
    tp2: "TP2",
    sl: "SL",
    quantity: "Quantity",
    risk: "Risk",
    generatedAt: "Generated",
    execute: "Execute",
    cancel: "Cancel",
    long: "Long",
    short: "Short",
    executing: "Executing...",
    cancelling: "Cancelling...",
    signalsGenerated: "signals generated",
    signalExecuted: "Signal executed successfully",
    signalCancelled: "Signal cancelled",
    scanError: "Failed to scan for signals",
    executeError: "Failed to execute signal",
    cancelError: "Failed to cancel signal",
  },
  es: {
    title: "Señales de Trading",
    description: "Señales de trading generadas por IA con gestión de riesgo basada en ATR",
    scanSignals: "Buscar Señales",
    scanning: "Buscando...",
    portfolio: "Portafolio",
    selectPortfolio: "Seleccionar portafolio",
    status: "Estado",
    allSignals: "Todas",
    pending: "Pendientes",
    executed: "Ejecutadas",
    expired: "Expiradas",
    cancelled: "Canceladas",
    noSignals: "No se encontraron señales",
    scanToGenerate: "Haz clic en 'Buscar Señales' para generar nuevas oportunidades de trading",
    symbol: "Símbolo",
    side: "Lado",
    entry: "Entrada",
    tp1: "TP1",
    tp2: "TP2",
    sl: "SL",
    quantity: "Cantidad",
    risk: "Riesgo",
    generatedAt: "Generada",
    execute: "Ejecutar",
    cancel: "Cancelar",
    long: "Largo",
    short: "Corto",
    executing: "Ejecutando...",
    cancelling: "Cancelando...",
    signalsGenerated: "señales generadas",
    signalExecuted: "Señal ejecutada exitosamente",
    signalCancelled: "Señal cancelada",
    scanError: "Error al buscar señales",
    executeError: "Error al ejecutar señal",
    cancelError: "Error al cancelar señal",
  },
  "pt-BR": {
    title: "Sinais de Trading",
    description: "Sinais de trading gerados por IA com gestão de risco baseada em ATR",
    scanSignals: "Escanear Sinais",
    scanning: "Escaneando...",
    portfolio: "Portfólio",
    selectPortfolio: "Selecionar portfólio",
    status: "Status",
    allSignals: "Todos",
    pending: "Pendentes",
    executed: "Executados",
    expired: "Expirados",
    cancelled: "Cancelados",
    noSignals: "Nenhum sinal encontrado",
    scanToGenerate: "Clique em 'Escanear Sinais' para gerar novas oportunidades de trading",
    symbol: "Símbolo",
    side: "Lado",
    entry: "Entrada",
    tp1: "TP1",
    tp2: "TP2",
    sl: "SL",
    quantity: "Quantidade",
    risk: "Risco",
    generatedAt: "Gerado",
    execute: "Executar",
    cancel: "Cancelar",
    long: "Compra",
    short: "Venda",
    executing: "Executando...",
    cancelling: "Cancelando...",
    signalsGenerated: "sinais gerados",
    signalExecuted: "Sinal executado com sucesso",
    signalCancelled: "Sinal cancelado",
    scanError: "Erro ao escanear sinais",
    executeError: "Erro ao executar sinal",
    cancelError: "Erro ao cancelar sinal",
  },
};

export default function Signals() {
  const { language } = useLanguage();
  const t = translations[language];
  const { toast } = useToast();

  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  // Fetch portfolios (always refetch on mount to get latest data)
  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolios'],
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Auto-select first portfolio when portfolios load
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolio]);

  // Fetch signals
  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: ['/api/signals', selectedPortfolio, statusFilter],
    queryFn: async () => {
      if (!selectedPortfolio) return [];
      const params = new URLSearchParams({
        portfolioId: selectedPortfolio,
        status: statusFilter,
        limit: '50',
      });
      const response = await fetch(`/api/signals?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch signals');
      return response.json();
    },
    enabled: !!selectedPortfolio,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Scan for signals mutation
  const scanMutation = useMutation<ScanSignalsResponse>({
    mutationFn: async () => {
      if (!selectedPortfolio) throw new Error("No portfolio selected");

      // Fetch real-time market metrics from backend
      // Backend fetches latest ticks from Redis, calculates indicators from bars_1m
      // Using known symbols from Kraken WebSocket (confirmed in logs)
      const symbolsToScan = [
        "XBT/USD", "ETH/USD", "SOL/USD", "XRP/USD", "ADA/USD",
        "DOT/USD", "LINK/USD", "AVAX/USD", "UNI/USD", "ATOM/USD"
      ];

      const response = await apiRequest<{
        metrics: Array<{
          symbol: string;
          price: number | null;
          ema12: number | null;
          ema36: number | null;
          atr: number | null;
          updatedAt: string;
        }>;
        unknownSymbols: string[];
        message?: string;
      }>("/api/market/metrics", "POST", {
        symbols: symbolsToScan,
      });

      // Log warnings for unknown symbols
      if (response.unknownSymbols && response.unknownSymbols.length > 0) {
        console.warn(`[Signals] Unknown symbols: ${response.unknownSymbols.join(', ')}`);
      }

      // Filter out symbols with insufficient data (nulls)
      const validMarketData = response.metrics
        .filter(md => md.price !== null && md.ema12 !== null && md.ema36 !== null && md.atr !== null)
        .map(md => ({
          symbol: md.symbol,
          price: md.price!,
          ema12: md.ema12!,
          ema36: md.ema36!,
          atr: md.atr!,
        }));

      if (validMarketData.length === 0) {
        throw new Error("No market data available with complete indicators. Please wait for more data to be collected.");
      }

      return apiRequest<ScanSignalsResponse>("/api/signals/scan", "POST", {
        portfolioId: selectedPortfolio,
        marketData: validMarketData,
      });
    },
    onSuccess: (data) => {
      toast({
        title: `${data.signals.length} ${t.signalsGenerated}`,
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/signals'] });
    },
    onError: () => {
      toast({
        title: t.scanError,
        variant: "destructive",
      });
    },
  });

  // Execute signal mutation
  const executeMutation = useMutation({
    mutationFn: async (signalId: string) => {
      return apiRequest(`/api/signals/${signalId}/status`, "PUT", {
        status: "executed",
      });
    },
    onSuccess: () => {
      toast({
        title: t.signalExecuted,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/signals'] });
    },
    onError: () => {
      toast({
        title: t.executeError,
        variant: "destructive",
      });
    },
  });

  // Cancel signal mutation
  const cancelMutation = useMutation({
    mutationFn: async (signalId: string) => {
      return apiRequest(`/api/signals/${signalId}/status`, "PUT", {
        status: "cancelled",
        reason: "Manual cancellation",
      });
    },
    onSuccess: () => {
      toast({
        title: t.signalCancelled,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/signals'] });
    },
    onError: () => {
      toast({
        title: t.cancelError,
        variant: "destructive",
      });
    },
  });

  const handleScan = useCallback(() => {
    scanMutation.mutate();
  }, [scanMutation]);

  const handleExecute = useCallback((signalId: string) => {
    executeMutation.mutate(signalId);
  }, [executeMutation]);

  const handleCancel = useCallback((signalId: string) => {
    cancelMutation.mutate(signalId);
  }, [cancelMutation]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { variant: "default" as const, icon: Clock },
      executed: { variant: "default" as const, icon: CheckCircle },
      expired: { variant: "secondary" as const, icon: XCircle },
      cancelled: { variant: "secondary" as const, icon: XCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {t[status as keyof typeof t] || status}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-xs">
          <Select
            value={selectedPortfolio}
            onValueChange={setSelectedPortfolio}
          >
            <SelectTrigger data-testid="select-portfolio">
              <SelectValue placeholder={t.selectPortfolio} />
            </SelectTrigger>
            <SelectContent>
              {portfolios?.map((portfolio) => (
                <SelectItem
                  key={portfolio.id}
                  value={portfolio.id}
                  data-testid={`portfolio-option-${portfolio.id}`}
                >
                  {portfolio.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 max-w-xs">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t.pending}</SelectItem>
              <SelectItem value="executed">{t.executed}</SelectItem>
              <SelectItem value="expired">{t.expired}</SelectItem>
              <SelectItem value="cancelled">{t.cancelled}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleScan}
          disabled={!selectedPortfolio || scanMutation.isPending}
          data-testid="button-scan-signals"
        >
          {scanMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.scanning}
            </>
          ) : (
            <>
              <Scan className="h-4 w-4" />
              {t.scanSignals}
            </>
          )}
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>{t.status}: {t[statusFilter as keyof typeof t]}</CardTitle>
          <CardDescription>
            {signals.length} {t[statusFilter as keyof typeof t].toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-muted-foreground">{t.noSignals}</p>
              <p className="text-sm text-muted-foreground">{t.scanToGenerate}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.symbol}</TableHead>
                  <TableHead>{t.side}</TableHead>
                  <TableHead>{t.entry}</TableHead>
                  <TableHead>{t.tp1}</TableHead>
                  <TableHead>{t.tp2}</TableHead>
                  <TableHead>{t.sl}</TableHead>
                  <TableHead>{t.quantity}</TableHead>
                  <TableHead>{t.risk}</TableHead>
                  <TableHead>{t.generatedAt}</TableHead>
                  <TableHead>{t.status}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((signal) => (
                  <TableRow key={signal.id} data-testid={`row-signal-${signal.id}`}>
                    <TableCell className="font-medium" data-testid={`text-symbol-${signal.id}`}>{signal.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant={signal.signal_type === "long" ? "default" : "secondary"}
                        className="gap-1"
                        data-testid={`badge-signal-type-${signal.id}`}
                      >
                        {signal.signal_type === "long" ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {t[signal.signal_type]}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-entry-price-${signal.id}`}>${parseFloat(signal.price_at_signal).toFixed(2)}</TableCell>
                    <TableCell className="text-green-600" data-testid={`text-tp1-${signal.id}`}>
                      ${parseFloat(signal.calculated_tp1).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-green-600" data-testid={`text-tp2-${signal.id}`}>
                      ${parseFloat(signal.calculated_tp2).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-red-600" data-testid={`text-sl-${signal.id}`}>
                      ${parseFloat(signal.calculated_sl).toFixed(2)}
                    </TableCell>
                    <TableCell data-testid={`text-quantity-${signal.id}`}>{parseFloat(signal.calculated_position_size).toFixed(4)}</TableCell>
                    <TableCell data-testid={`text-risk-${signal.id}`}>${(signal.risk_per_trade_bps_used / 100).toFixed(2)}%</TableCell>
                    <TableCell>
                      {new Date(signal.generated_at).toLocaleString(
                        language === "pt-BR" ? "pt-BR" : language,
                        { dateStyle: "short", timeStyle: "short" }
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(signal.status)}</TableCell>
                    <TableCell className="text-right">
                      {signal.status === "pending" && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleExecute(signal.id)}
                            disabled={executeMutation.isPending}
                            data-testid={`button-execute-${signal.id}`}
                          >
                            {executeMutation.isPending ? t.executing : t.execute}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(signal.id)}
                            disabled={cancelMutation.isPending}
                            data-testid={`button-cancel-${signal.id}`}
                          >
                            {cancelMutation.isPending ? t.cancelling : t.cancel}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
