import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, TrendingUp, TrendingDown, RefreshCw, WifiOff, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarketDataWebSocket, type MarketDataMessage, type TickerUpdate } from "@/hooks/useMarketDataWebSocket";

const translations = {
  en: {
    title: "Real-Time Market Data",
    subtitle: "Live cryptocurrency prices and order books from Kraken",
    selectSymbol: "Select Symbol",
    l1Quote: "Level 1 Quote",
    l2OrderBook: "Level 2 Order Book",
    recentTicks: "Recent Trades",
    bids: "Bids",
    asks: "Asks",
    price: "Price",
    quantity: "Quantity",
    spread: "Spread",
    spreadBps: "bps",
    noData: "No data available",
    loading: "Loading market data...",
    refresh: "Refresh",
    timestamp: "Timestamp",
    side: "Side",
    buy: "Buy",
    sell: "Sell",
  },
  es: {
    title: "Datos de Mercado en Tiempo Real",
    subtitle: "Precios de criptomonedas en vivo y libros de órdenes de Kraken",
    selectSymbol: "Seleccionar Símbolo",
    l1Quote: "Cotización Nivel 1",
    l2OrderBook: "Libro de Órdenes Nivel 2",
    recentTicks: "Operaciones Recientes",
    bids: "Ofertas de Compra",
    asks: "Ofertas de Venta",
    price: "Precio",
    quantity: "Cantidad",
    spread: "Diferencial",
    spreadBps: "pbs",
    noData: "Sin datos disponibles",
    loading: "Cargando datos de mercado...",
    refresh: "Actualizar",
    timestamp: "Marca de Tiempo",
    side: "Lado",
    buy: "Compra",
    sell: "Venta",
  },
  "pt-BR": {
    title: "Dados de Mercado em Tempo Real",
    subtitle: "Preços de criptomoedas ao vivo e livros de ofertas da Kraken",
    selectSymbol: "Selecionar Símbolo",
    l1Quote: "Cotação Nível 1",
    l2OrderBook: "Livro de Ofertas Nível 2",
    recentTicks: "Negociações Recentes",
    bids: "Ofertas de Compra",
    asks: "Ofertas de Venda",
    price: "Preço",
    quantity: "Quantidade",
    spread: "Spread",
    spreadBps: "pbs",
    noData: "Sem dados disponíveis",
    loading: "Carregando dados de mercado...",
    refresh: "Atualizar",
    timestamp: "Timestamp",
    side: "Lado",
    buy: "Compra",
    sell: "Venda",
  },
};

const DEFAULT_SYMBOLS = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "ADA/USD",
  "DOGE/USD",
  "DOT/USD",
  "LINK/USD",
];

export default function MarketData() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations];
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOLS[0]);
  const [livePrice, setLivePrice] = useState<string | null>(null);

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage } = useMarketDataWebSocket({
    onMessage: (message: MarketDataMessage) => {
      if (message.type === 'ticker') {
        const ticker = message as TickerUpdate;
        // Update live price if it's for the selected symbol
        if (ticker.symbol === selectedSymbol && ticker.price) {
          setLivePrice(ticker.price);
        }
      }
    },
  });

  // Fetch L1 quote
  const { data: l1Quote, refetch: refetchL1 } = useQuery({
    queryKey: ['/api/market/l1', selectedSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/market/l1/${encodeURIComponent(selectedSymbol)}`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Fetch L2 order book
  const { data: l2OrderBook, refetch: refetchL2 } = useQuery({
    queryKey: ['/api/market/l2', selectedSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/market/l2/${encodeURIComponent(selectedSymbol)}`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Fetch recent ticks
  const { data: recentTicks, refetch: refetchTicks } = useQuery({
    queryKey: ['/api/market/ticks', selectedSymbol],
    queryFn: async () => {
      const symbol = encodeURIComponent(selectedSymbol);
      const params = new URLSearchParams({ limit: '20' });
      const res = await fetch(`/api/market/ticks/${symbol}?${params}`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 3000, // Auto-refresh every 3 seconds
  });

  const handleRefreshAll = () => {
    refetchL1();
    refetchL2();
    refetchTicks();
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 1) return num.toFixed(4);
    return num.toFixed(6);
  };

  const formatQuantity = (qty: string) => {
    const num = parseFloat(qty);
    if (num >= 100) return num.toFixed(2);
    if (num >= 1) return num.toFixed(4);
    return num.toFixed(8);
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-market-data">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">{t.title}</h1>
            <Badge 
              variant={isConnected ? "default" : "secondary"} 
              className="flex items-center gap-1"
              data-testid="badge-websocket-status"
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Offline</span>
                </>
              )}
            </Badge>
          </div>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="w-[180px]" data-testid="select-symbol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_SYMBOLS.map((symbol) => (
                <SelectItem key={symbol} value={symbol} data-testid={`select-symbol-${symbol}`}>
                  {symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleRefreshAll}
            data-testid="button-refresh-all"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* L1 Quote Card */}
        <Card data-testid="card-l1-quote">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t.l1Quote}
            </CardTitle>
            <CardDescription>
              {selectedSymbol}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!l1Quote ? (
              <p className="text-sm text-muted-foreground">{t.noData}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950 rounded-md">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.bids}</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-bid-price">
                      ${formatPrice(l1Quote.bid_price)}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-bid-quantity">
                      {formatQuantity(l1Quote.bid_quantity)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-950 rounded-md">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.asks}</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-ask-price">
                      ${formatPrice(l1Quote.ask_price)}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-ask-quantity">
                      {formatQuantity(l1Quote.ask_quantity)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">{t.spread}</span>
                  <Badge variant="secondary" data-testid="badge-spread">
                    {parseFloat(l1Quote.spread_bps).toFixed(2)} {t.spreadBps}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Ticks Card */}
        <Card data-testid="card-recent-ticks">
          <CardHeader>
            <CardTitle>{t.recentTicks}</CardTitle>
            <CardDescription>
              {selectedSymbol} - Last 20 trades
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!recentTicks?.ticks || recentTicks.ticks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noData}</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recentTicks.ticks.slice(0, 20).map((tick: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="flex justify-between items-center p-2 hover-elevate rounded-md text-sm"
                    data-testid={`tick-${idx}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={tick.side === 'buy' ? 'default' : 'secondary'}
                        className="w-12 justify-center"
                      >
                        {tick.side === 'buy' ? t.buy : t.sell}
                      </Badge>
                      <span className="font-mono font-semibold" data-testid={`tick-price-${idx}`}>
                        ${formatPrice(tick.price)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs" data-testid={`tick-quantity-${idx}`}>
                        {formatQuantity(tick.quantity)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(tick.exchange_ts)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* L2 Order Book Card - Full Width */}
      <Card data-testid="card-l2-orderbook">
        <CardHeader>
          <CardTitle>{t.l2OrderBook}</CardTitle>
          <CardDescription>
            {selectedSymbol} - Depth analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!l2OrderBook ? (
            <p className="text-sm text-muted-foreground">{t.noData}</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Bids */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  {t.bids}
                </h3>
                <div className="space-y-1">
                  {l2OrderBook.bids && l2OrderBook.bids.length > 0 ? (
                    l2OrderBook.bids.map((bid: any, idx: number) => (
                      <div 
                        key={idx} 
                        className="grid grid-cols-2 gap-4 p-2 hover-elevate rounded-md text-sm font-mono"
                        data-testid={`bid-${idx}`}
                      >
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          ${formatPrice(bid.price)}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {formatQuantity(bid.quantity)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noData}</p>
                  )}
                </div>
              </div>

              {/* Asks */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  {t.asks}
                </h3>
                <div className="space-y-1">
                  {l2OrderBook.asks && l2OrderBook.asks.length > 0 ? (
                    l2OrderBook.asks.map((ask: any, idx: number) => (
                      <div 
                        key={idx} 
                        className="grid grid-cols-2 gap-4 p-2 hover-elevate rounded-md text-sm font-mono"
                        data-testid={`ask-${idx}`}
                      >
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          ${formatPrice(ask.price)}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {formatQuantity(ask.quantity)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noData}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
