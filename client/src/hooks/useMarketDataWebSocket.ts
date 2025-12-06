import { useEffect, useRef, useState, useCallback } from 'react';

export interface TickerUpdate {
  type: 'ticker';
  symbol: string;
  price: string | null;
  volume: string | null;
  high: string | null;
  low: string | null;
  bid: string | null;
  ask: string | null;
  timestamp: number;
}

export interface StatusUpdate {
  type: 'status';
  connected: boolean;
}

export type MarketDataMessage = TickerUpdate | StatusUpdate;

interface UseMarketDataWebSocketOptions {
  onMessage?: (message: MarketDataMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useMarketDataWebSocket(options: UseMarketDataWebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MarketDataMessage | null>(null);

  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      // Connect to WebSocket server (use ws:// or wss:// based on page protocol)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/market-data`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('📡 Market Data WebSocket connected');
        setIsConnected(true);
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as MarketDataMessage;
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };

      ws.onclose = () => {
        console.log('📡 Market Data WebSocket disconnected');
        setIsConnected(false);
        onDisconnect?.();
        wsRef.current = null;

        // Auto-reconnect if enabled
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Reconnecting to Market Data WebSocket...');
            connect();
          }, reconnectInterval);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      
      // Try to reconnect if auto-reconnect is enabled
      if (autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Retrying WebSocket connection...');
          connect();
        }, reconnectInterval);
      }
    }
  }, [onMessage, onConnect, onDisconnect, onError, autoReconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Auto-connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
  };
}
