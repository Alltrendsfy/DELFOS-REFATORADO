import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, X, RefreshCw, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import type { Order, Portfolio, MarketDataCache, Position } from "@shared/schema";
import { ActivePositionsTable } from "./trading/ActivePositionsTable";
import { OrderForm } from "./trading/OrderForm";
import { PositionForm } from "./trading/PositionForm";

const translations = {
  en: {
    title: "Trading",
    subtitle: "Execute orders and manage positions on Kraken",
    orders: "Orders",
    positions: "Positions",
    placeOrder: "Place Order",
    orderHistory: "Order History",
    openPosition: "Open Position",
    activePositions: "Active Positions",
    long: "Long",
    short: "Short",
    entryPrice: "Entry",
    currentPrice: "Current",
    unrealizedPnL: "Unrealized P&L",
    closePosition: "Close Position",
    noPositions: "No active positions",
    positionOpened: "Position opened successfully",
    positionClosed: "Position closed successfully",
    confirmClose: "Confirm Close",
    confirmCloseMessage: "Are you sure you want to close this position?",
    selectPortfolio: "Select Portfolio",
    selectSymbol: "Select Symbol",
    side: "Side",
    buy: "Buy",
    sell: "Sell",
    orderType: "Order Type",
    market: "Market",
    limit: "Limit",
    stopLoss: "Stop Loss",
    takeProfit: "Take Profit",
    quantity: "Quantity",
    price: "Price (Optional for Market)",
    stopPrice: "Stop Price (Optional)",
    executeOrder: "Execute Order",
    symbol: "Symbol",
    sideLabel: "Side",
    type: "Type",
    qty: "Quantity",
    priceLabel: "Price",
    status: "Status",
    actions: "Actions",
    cancel: "Cancel",
    refresh: "Refresh",
    noOrders: "No orders yet",
    noPortfolio: "Please select a portfolio",
    orderExecuted: "Order executed successfully on Kraken",
    orderCancelled: "Order cancelled successfully",
    statusRefreshed: "Order status refreshed",
    error: "Error",
    loading: "Loading...",
    enterQuantity: "Enter quantity",
    enterPrice: "Enter price",
    pending: "Pending",
    filled: "Filled",
    partiallyFilled: "Partially Filled",
    cancelled: "Cancelled",
    rejected: "Rejected",
    refreshAll: "Refresh All",
    filledQty: "Filled Qty",
    avgPrice: "Avg Price",
    requiredFields: "Please fill in all required fields",
    priceRequired: "Price is required for limit orders",
    stopPriceRequired: "Stop price is required for stop loss/take profit orders",
  },
  es: {
    title: "Trading",
    subtitle: "Ejecuta órdenes y gestiona posiciones en Kraken",
    orders: "Órdenes",
    positions: "Posiciones",
    placeOrder: "Colocar Orden",
    orderHistory: "Historial de Órdenes",
    openPosition: "Abrir Posición",
    activePositions: "Posiciones Activas",
    long: "Long",
    short: "Short",
    entryPrice: "Entrada",
    currentPrice: "Actual",
    unrealizedPnL: "P&L No Realizado",
    closePosition: "Cerrar Posición",
    noPositions: "Sin posiciones activas",
    positionOpened: "Posición abierta exitosamente",
    positionClosed: "Posición cerrada exitosamente",
    confirmClose: "Confirmar Cierre",
    confirmCloseMessage: "¿Estás seguro que deseas cerrar esta posición?",
    selectPortfolio: "Seleccionar Cartera",
    selectSymbol: "Seleccionar Símbolo",
    side: "Lado",
    buy: "Comprar",
    sell: "Vender",
    orderType: "Tipo de Orden",
    market: "Mercado",
    limit: "Límite",
    stopLoss: "Stop Loss",
    takeProfit: "Take Profit",
    quantity: "Cantidad",
    price: "Precio (Opcional para Mercado)",
    stopPrice: "Precio Stop (Opcional)",
    executeOrder: "Ejecutar Orden",
    symbol: "Símbolo",
    sideLabel: "Lado",
    type: "Tipo",
    qty: "Cantidad",
    priceLabel: "Precio",
    status: "Estado",
    actions: "Acciones",
    cancel: "Cancelar",
    refresh: "Actualizar",
    noOrders: "Sin órdenes aún",
    noPortfolio: "Por favor selecciona una cartera",
    orderExecuted: "Orden ejecutada exitosamente en Kraken",
    orderCancelled: "Orden cancelada exitosamente",
    statusRefreshed: "Estado de orden actualizado",
    error: "Error",
    loading: "Cargando...",
    enterQuantity: "Ingresa cantidad",
    enterPrice: "Ingresa precio",
    pending: "Pendiente",
    filled: "Completada",
    partiallyFilled: "Parcialmente Completada",
    cancelled: "Cancelada",
    rejected: "Rechazada",
    refreshAll: "Actualizar Todo",
    filledQty: "Cant. Completada",
    avgPrice: "Precio Promedio",
    requiredFields: "Por favor completa todos los campos requeridos",
    priceRequired: "El precio es requerido para órdenes límite",
    stopPriceRequired: "El precio stop es requerido para órdenes stop loss/take profit",
  },
  "pt-BR": {
    title: "Trading",
    subtitle: "Execute ordens e gerencie posições no Kraken",
    orders: "Ordens",
    positions: "Posições",
    placeOrder: "Colocar Ordem",
    orderHistory: "Histórico de Ordens",
    openPosition: "Abrir Posição",
    activePositions: "Posições Ativas",
    long: "Long",
    short: "Short",
    entryPrice: "Entrada",
    currentPrice: "Atual",
    unrealizedPnL: "P&L Não Realizado",
    closePosition: "Fechar Posição",
    noPositions: "Sem posições ativas",
    positionOpened: "Posição aberta com sucesso",
    positionClosed: "Posição fechada com sucesso",
    confirmClose: "Confirmar Fechamento",
    confirmCloseMessage: "Tem certeza que deseja fechar esta posição?",
    selectPortfolio: "Selecionar Carteira",
    selectSymbol: "Selecionar Símbolo",
    side: "Lado",
    buy: "Comprar",
    sell: "Vender",
    orderType: "Tipo de Ordem",
    market: "Mercado",
    limit: "Limite",
    stopLoss: "Stop Loss",
    takeProfit: "Take Profit",
    quantity: "Quantidade",
    price: "Preço (Opcional para Mercado)",
    stopPrice: "Preço Stop (Opcional)",
    executeOrder: "Executar Ordem",
    symbol: "Símbolo",
    sideLabel: "Lado",
    type: "Tipo",
    qty: "Quantidade",
    priceLabel: "Preço",
    status: "Status",
    actions: "Ações",
    cancel: "Cancelar",
    refresh: "Atualizar",
    noOrders: "Sem ordens ainda",
    noPortfolio: "Por favor selecione uma carteira",
    orderExecuted: "Ordem executada com sucesso no Kraken",
    orderCancelled: "Ordem cancelada com sucesso",
    statusRefreshed: "Status da ordem atualizado",
    error: "Erro",
    loading: "Carregando...",
    enterQuantity: "Digite quantidade",
    enterPrice: "Digite preço",
    pending: "Pendente",
    filled: "Completada",
    partiallyFilled: "Parcialmente Completada",
    cancelled: "Cancelada",
    rejected: "Rejeitada",
    refreshAll: "Atualizar Tudo",
    filledQty: "Qtd. Completada",
    avgPrice: "Preço Médio",
    requiredFields: "Por favor preencha todos os campos obrigatórios",
    priceRequired: "Preço é obrigatório para ordens limite",
    stopPriceRequired: "Preço stop é obrigatório para ordens stop loss/take profit",
  },
};

export default function Trading() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const t = translations[language as keyof typeof translations];

  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");
  const [formData, setFormData] = useState({
    symbol: "",
    side: "buy",
    type: "market",
    quantity: "",
    price: "",
    stopPrice: "",
  });
  
  // Position form state
  const [positionFormData, setPositionFormData] = useState({
    symbol: "",
    side: "long",
    quantity: "",
    stopLoss: "",
    takeProfit: "",
  });

  // Fetch portfolios
  const { data: portfolios, isLoading: loadingPortfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  // Fetch available symbols
  const { data: symbols, isLoading: loadingSymbols } = useQuery<MarketDataCache[]>({
    queryKey: ["/api/trading/symbols"],
  });

  // Fetch orders for selected portfolio
  const { data: orders, isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: ["/api/orders", selectedPortfolio],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${selectedPortfolio}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await response.json();
          throw new Error(json.message || "Failed to fetch orders");
        }
        throw new Error("Failed to fetch orders");
      }
      return response.json();
    },
    enabled: !!selectedPortfolio,
  });

  // Fetch positions for selected portfolio with real-time polling
  const { data: positions, isLoading: loadingPositions } = useQuery<Position[]>({
    queryKey: ["/api/trading/positions", selectedPortfolio],
    queryFn: async () => {
      const response = await fetch(`/api/trading/positions?portfolioId=${selectedPortfolio}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await response.json();
          throw new Error(json.message || "Failed to fetch positions");
        }
        throw new Error("Failed to fetch positions");
      }
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5s for real-time PnL updates
    enabled: !!selectedPortfolio,
  });

  // Auto-select first portfolio
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolio) {
      setSelectedPortfolio(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolio]);

  // Execute order mutation
  const executeOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/orders/execute", "POST", data);
    },
    onSuccess: () => {
      toast({ title: t.orderExecuted });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedPortfolio] });
      setFormData({ symbol: "", side: "buy", type: "market", quantity: "", price: "", stopPrice: "" });
    },
    onError: (error: any) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest(`/api/orders/${orderId}/cancel`, "POST", {});
    },
    onSuccess: () => {
      toast({ title: t.orderCancelled });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedPortfolio] });
    },
    onError: (error: any) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  // Refresh order status mutation
  const refreshOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest(`/api/orders/${orderId}/refresh`, "GET");
    },
    onSuccess: () => {
      toast({ title: t.statusRefreshed });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedPortfolio] });
    },
    onError: (error: any) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  // Position mutations
  const openPositionMutation = useMutation({
    mutationFn: async (data: { portfolioId: string; symbol: string; side: string; quantity: string; stopLoss?: string; takeProfit?: string }) => {
      return await apiRequest("/api/trading/positions/open", "POST", data);
    },
    onSuccess: () => {
      toast({ title: t.positionOpened });
      queryClient.invalidateQueries({ queryKey: ["/api/trading/positions", selectedPortfolio] });
      setPositionFormData({ symbol: "", side: "long", quantity: "", stopLoss: "", takeProfit: "" });
    },
    onError: (error: any) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const closePositionMutation = useMutation({
    mutationFn: async (positionId: string) => {
      return await apiRequest(`/api/trading/positions/${positionId}/close`, "POST", {});
    },
    onSuccess: () => {
      toast({ title: t.positionClosed });
      queryClient.invalidateQueries({ queryKey: ["/api/trading/positions", selectedPortfolio] });
    },
    onError: (error: any) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const handleExecuteOrder = () => {
    // Validate required fields
    if (!selectedPortfolio || !formData.symbol || !formData.quantity) {
      toast({ 
        title: t.error, 
        description: t.requiredFields, 
        variant: "destructive" 
      });
      return;
    }

    // Validate required fields based on order type
    if (formData.type === "limit" && !formData.price) {
      toast({ 
        title: t.error, 
        description: t.priceRequired, 
        variant: "destructive" 
      });
      return;
    }

    if ((formData.type === "stop_loss" || formData.type === "take_profit") && !formData.stopPrice) {
      toast({ 
        title: t.error, 
        description: t.stopPriceRequired, 
        variant: "destructive" 
      });
      return;
    }

    const orderData: any = {
      portfolioId: selectedPortfolio,
      symbol: formData.symbol,
      side: formData.side,
      type: formData.type,
      quantity: formData.quantity,
    };

    // Add price for limit orders
    if (formData.type === "limit") {
      orderData.price = formData.price;
    }

    // Add stop price for stop orders
    if (formData.type === "stop_loss" || formData.type === "take_profit") {
      orderData.stopPrice = formData.stopPrice;
    }

    executeOrderMutation.mutate(orderData);
  };

  const handleCancelOrder = (orderId: string) => {
    cancelOrderMutation.mutate(orderId);
  };

  const handleRefreshOrder = (orderId: string) => {
    refreshOrderMutation.mutate(orderId);
  };

  // Memoized position handlers (as per Architect recommendation)
  const handleOpenPosition = useCallback(() => {
    if (!selectedPortfolio || !positionFormData.symbol || !positionFormData.quantity) {
      toast({ 
        title: t.error, 
        description: t.requiredFields, 
        variant: "destructive" 
      });
      return;
    }

    openPositionMutation.mutate({
      portfolioId: selectedPortfolio,
      symbol: positionFormData.symbol,
      side: positionFormData.side,
      quantity: positionFormData.quantity,
      stopLoss: positionFormData.stopLoss || undefined,
      takeProfit: positionFormData.takeProfit || undefined,
    });
  }, [selectedPortfolio, positionFormData, openPositionMutation, toast, t]);

  const handleClosePosition = useCallback((positionId: string) => {
    closePositionMutation.mutate(positionId);
  }, [closePositionMutation]);

  const handleOrderFormChange = useCallback((updates: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const handlePositionFormChange = useCallback((updates: Partial<typeof positionFormData>) => {
    setPositionFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      filled: "bg-green-500/10 text-green-500 border-green-500/20",
      partially_filled: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      cancelled: "bg-gray-500/10 text-gray-500 border-gray-500/20",
      rejected: "bg-red-500/10 text-red-500 border-red-500/20",
    };

    const statusText: Record<string, string> = {
      pending: t.pending,
      filled: t.filled,
      partially_filled: t.partiallyFilled,
      cancelled: t.cancelled,
      rejected: t.rejected,
    };

    return (
      <Badge variant="outline" className={statusColors[status] || ""}>
        {statusText[status] || status}
      </Badge>
    );
  };

  if (loadingPortfolios) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground mt-1">{t.subtitle}</p>
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders">{t.orders}</TabsTrigger>
          <TabsTrigger value="positions" data-testid="tab-positions">{t.positions}</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <OrderForm
              selectedPortfolio={selectedPortfolio}
              formData={formData}
              portfolios={portfolios}
              symbols={symbols}
              isPending={executeOrderMutation.isPending}
              onPortfolioChange={setSelectedPortfolio}
              onFormChange={handleOrderFormChange}
              onSubmit={handleExecuteOrder}
              translations={t}
            />

        {/* Orders List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t.orderHistory}</CardTitle>
                <CardDescription>
                  {orders?.length || 0} {orders?.length === 1 ? "order" : "orders"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedPortfolio ? (
              <div className="text-center py-12 text-muted-foreground">{t.noPortfolio}</div>
            ) : loadingOrders ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : !orders || orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">{t.noOrders}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium" data-testid="header-symbol">{t.symbol}</th>
                      <th className="text-left p-3 font-medium" data-testid="header-side">{t.sideLabel}</th>
                      <th className="text-left p-3 font-medium" data-testid="header-type">{t.type}</th>
                      <th className="text-right p-3 font-medium" data-testid="header-quantity">{t.qty}</th>
                      <th className="text-right p-3 font-medium" data-testid="header-price">{t.priceLabel}</th>
                      <th className="text-center p-3 font-medium" data-testid="header-status">{t.status}</th>
                      <th className="text-center p-3 font-medium" data-testid="header-actions">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const isBuy = order.side === "buy";
                      const isPending = order.status === "pending";

                      return (
                        <tr key={order.id} className="border-b hover-elevate" data-testid={`row-order-${order.id}`}>
                          <td className="p-3 font-medium" data-testid={`text-symbol-${order.id}`}>{order.symbol}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {isBuy ? (
                                <>
                                  <TrendingUp className="w-4 h-4 text-green-500" />
                                  <span className="text-green-500 font-medium" data-testid={`text-side-${order.id}`}>BUY</span>
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="w-4 h-4 text-red-500" />
                                  <span className="text-red-500 font-medium" data-testid={`text-side-${order.id}`}>SELL</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-3" data-testid={`text-type-${order.id}`}>{order.type.toUpperCase()}</td>
                          <td className="p-3 text-right font-mono" data-testid={`text-quantity-${order.id}`}>
                            {parseFloat(order.quantity).toFixed(8)}
                          </td>
                          <td className="p-3 text-right font-mono" data-testid={`text-price-${order.id}`}>
                            {order.price ? `$${parseFloat(order.price).toLocaleString()}` : "-"}
                          </td>
                          <td className="p-3 text-center" data-testid={`text-status-${order.id}`}>
                            {getStatusBadge(order.status)}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`button-refresh-${order.id}`}
                                onClick={() => handleRefreshOrder(order.id)}
                                disabled={refreshOrderMutation.isPending}
                              >
                                <RefreshCw className={`w-4 h-4 ${refreshOrderMutation.isPending ? "animate-spin" : ""}`} />
                              </Button>
                              {isPending && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  data-testid={`button-cancel-${order.id}`}
                                  onClick={() => handleCancelOrder(order.id)}
                                  disabled={cancelOrderMutation.isPending}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          {selectedPortfolio ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <PositionForm
                  formData={positionFormData}
                  symbols={symbols}
                  isPending={openPositionMutation.isPending}
                  onFormChange={handlePositionFormChange}
                  onSubmit={handleOpenPosition}
                  translations={t}
                />
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.activePositions}</CardTitle>
                    <CardDescription>
                      {positions?.length || 0} {t.positions.toLowerCase()} • {t.unrealizedPnL}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ActivePositionsTable
                      positions={positions || []}
                      onClosePosition={handleClosePosition}
                      isClosing={closePositionMutation.isPending}
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
                        cancel: t.cancel,
                      }}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">{t.noPortfolio}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
