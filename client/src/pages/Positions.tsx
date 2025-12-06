import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import type { Position, Portfolio } from "@shared/schema";
import { ActivePositionsTable } from "./trading/ActivePositionsTable";

const translations = {
  en: {
    title: "Active Positions",
    subtitle: "Monitor and manage your open trading positions",
    selectPortfolio: "Select Portfolio",
    noPortfolio: "Please select a portfolio",
    symbol: "Symbol",
    side: "Side",
    long: "Long",
    short: "Short",
    qty: "Quantity",
    entryPrice: "Entry",
    currentPrice: "Current",
    unrealizedPnL: "Unrealized P&L",
    actions: "Actions",
    closePosition: "Close",
    noPositions: "No active positions",
    confirmClose: "Confirm Close",
    confirmCloseMessage: "Are you sure you want to close this position?",
    confirmCloseLiveTitle: "CLOSE LIVE POSITION",
    confirmCloseLiveMessage: "WARNING: This will execute a REAL market order on Kraken using REAL CAPITAL. This action cannot be undone. Are you absolutely sure?",
    cancel: "Cancel",
    positionClosed: "Position closed successfully",
    error: "Error",
    updatePrices: "Update Prices",
    pricesUpdated: "Position prices updated",
    loading: "Loading...",
    paperMode: "PAPER",
    liveMode: "LIVE",
  },
  es: {
    title: "Posiciones Activas",
    subtitle: "Monitorea y gestiona tus posiciones de trading abiertas",
    selectPortfolio: "Seleccionar Cartera",
    noPortfolio: "Por favor selecciona una cartera",
    symbol: "Símbolo",
    side: "Lado",
    long: "Long",
    short: "Short",
    qty: "Cantidad",
    entryPrice: "Entrada",
    currentPrice: "Actual",
    unrealizedPnL: "P&L No Realizado",
    actions: "Acciones",
    closePosition: "Cerrar",
    noPositions: "Sin posiciones activas",
    confirmClose: "Confirmar Cierre",
    confirmCloseMessage: "¿Estás seguro que deseas cerrar esta posición?",
    confirmCloseLiveTitle: "CERRAR POSICIÓN EN VIVO",
    confirmCloseLiveMessage: "ADVERTENCIA: Esto ejecutará una orden de mercado REAL en Kraken usando CAPITAL REAL. Esta acción no se puede deshacer. ¿Estás absolutamente seguro?",
    cancel: "Cancelar",
    positionClosed: "Posición cerrada exitosamente",
    error: "Error",
    updatePrices: "Actualizar Precios",
    pricesUpdated: "Precios de posiciones actualizados",
    loading: "Cargando...",
    paperMode: "PAPER",
    liveMode: "EN VIVO",
  },
  "pt-BR": {
    title: "Posições Ativas",
    subtitle: "Monitore e gerencie suas posições de trading abertas",
    selectPortfolio: "Selecionar Portfólio",
    noPortfolio: "Por favor selecione um portfólio",
    symbol: "Símbolo",
    side: "Lado",
    long: "Long",
    short: "Short",
    qty: "Quantidade",
    entryPrice: "Entrada",
    currentPrice: "Atual",
    unrealizedPnL: "P&L Não Realizado",
    actions: "Ações",
    closePosition: "Fechar",
    noPositions: "Sem posições ativas",
    confirmClose: "Confirmar Fechamento",
    confirmCloseMessage: "Tem certeza que deseja fechar esta posição?",
    confirmCloseLiveTitle: "FECHAR POSIÇÃO AO VIVO",
    confirmCloseLiveMessage: "ATENÇÃO: Isto executará uma ordem de mercado REAL na Kraken usando CAPITAL REAL. Esta ação não pode ser desfeita. Tem certeza absoluta?",
    cancel: "Cancelar",
    positionClosed: "Posição fechada com sucesso",
    error: "Erro",
    updatePrices: "Atualizar Preços",
    pricesUpdated: "Preços das posições atualizados",
    loading: "Carregando...",
    paperMode: "PAPER",
    liveMode: "AO VIVO",
  },
};

export default function Positions() {
  const { language } = useLanguage();
  const t = translations[language];
  const { toast } = useToast();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");

  const { data: portfolios, isLoading: loadingPortfolios } = useQuery<Portfolio[]>({
    queryKey: ['/api/portfolios'],
  });

  const { data: positions = [], isLoading: loadingPositions } = useQuery<Position[]>({
    queryKey: ['/api/trading/positions', { portfolioId: selectedPortfolio }],
    enabled: !!selectedPortfolio,
  });

  const closePositionMutation = useMutation({
    mutationFn: async ({ positionId, portfolioId }: { positionId: string; portfolioId: string }) => {
      await apiRequest(`/api/trading/positions/${positionId}/close`, 'POST', {});
      return { portfolioId };
    },
    onSuccess: (_data, variables) => {
      // Use the portfolioId from when mutation was triggered, not current selectedPortfolio
      // This prevents race condition if user switches portfolios before server responds
      queryClient.invalidateQueries({ queryKey: ['/api/trading/positions', { portfolioId: variables.portfolioId }] });
      toast({
        title: t.positionClosed,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePricesMutation = useMutation({
    mutationFn: async (portfolioId: string) => {
      await apiRequest(`/api/trading/positions/${portfolioId}/update-prices`, 'POST', {});
      return { portfolioId };
    },
    onSuccess: (_data, portfolioId) => {
      // Use the portfolioId from when mutation was triggered, not current selectedPortfolio
      // This prevents race condition if user switches portfolios before server responds
      queryClient.invalidateQueries({ queryKey: ['/api/trading/positions', { portfolioId }] });
      toast({
        title: t.pricesUpdated,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: t.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const currentPortfolio = portfolios?.find(p => p.id === selectedPortfolio);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{t.title}</h1>
          {currentPortfolio?.trading_mode === "paper" ? (
            <Badge variant="secondary" className="text-sm" data-testid="badge-paper-mode">
              {t.paperMode}
            </Badge>
          ) : currentPortfolio?.trading_mode === "live" ? (
            <Badge variant="destructive" className="text-sm" data-testid="badge-live-mode">
              {t.liveMode}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex-1 max-w-md">
          <Select
            value={selectedPortfolio}
            onValueChange={setSelectedPortfolio}
            disabled={loadingPortfolios}
          >
            <SelectTrigger data-testid="select-portfolio">
              <SelectValue placeholder={t.selectPortfolio} />
            </SelectTrigger>
            <SelectContent>
              {portfolios?.map((portfolio) => (
                <SelectItem
                  key={portfolio.id}
                  value={portfolio.id}
                  data-testid={`option-portfolio-${portfolio.id}`}
                >
                  {portfolio.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPortfolio && (
          <Button
            variant="outline"
            onClick={() => updatePricesMutation.mutate(selectedPortfolio)}
            disabled={updatePricesMutation.isPending}
            data-testid="button-update-prices"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${updatePricesMutation.isPending ? 'animate-spin' : ''}`} />
            {t.updatePrices}
          </Button>
        )}
      </div>

      {!selectedPortfolio ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.title}</CardTitle>
            <CardDescription>{t.noPortfolio}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.title}</CardTitle>
            <CardDescription>
              {positions.length} {positions.length === 1 ? 'position' : 'positions'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPositions ? (
              <div className="text-center py-12 text-muted-foreground">
                {t.loading}
              </div>
            ) : (
              <ActivePositionsTable
                positions={positions}
                onClosePosition={(positionId) => {
                  const position = positions.find(p => p.id === positionId);
                  if (position) {
                    closePositionMutation.mutate({ 
                      positionId, 
                      portfolioId: position.portfolio_id 
                    });
                  }
                }}
                isClosing={closePositionMutation.isPending}
                tradingMode={currentPortfolio?.trading_mode as "paper" | "live" | undefined}
                translations={{
                  symbol: t.symbol,
                  side: t.side,
                  long: t.long,
                  short: t.short,
                  qty: t.qty,
                  entryPrice: t.entryPrice,
                  currentPrice: t.currentPrice,
                  unrealizedPnL: t.unrealizedPnL,
                  actions: t.actions,
                  closePosition: t.closePosition,
                  noPositions: t.noPositions,
                  confirmClose: t.confirmClose,
                  confirmCloseMessage: t.confirmCloseMessage,
                  confirmCloseLiveTitle: t.confirmCloseLiveTitle,
                  confirmCloseLiveMessage: t.confirmCloseLiveMessage,
                  cancel: t.cancel,
                }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
