import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles, TrendingUp, History, AlertTriangle, Activity } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface MarketContext {
  symbol: string;
  price: string;
  change24h: string;
  volume24h: string;
}

interface AIResponse {
  response: string;
  marketContext: MarketContext[];
}

interface AIAnalysis {
  analysis: string;
  marketContext: MarketContext[];
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const { language } = useLanguage();

  const texts = {
    en: {
      title: "AI Market Assistant",
      description: "Get insights, analysis and strategy suggestions powered by AI",
      placeholder: "Ask about market trends, strategies, or any crypto-related question...",
      send: "Send",
      analyze: "Analyze Market",
      history: "History",
      analyzing: "Analyzing...",
      typing: "DELFOS is typing...",
      you: "You",
      assistant: "DELFOS AI",
      rateLimit: "Rate limit reached. Please try again later.",
      error: "Failed to get response. Please try again.",
    },
    es: {
      title: "Asistente AI de Mercado",
      description: "Obtenga insights, análisis y sugerencias de estrategia impulsados por AI",
      placeholder: "Pregunta sobre tendencias del mercado, estrategias o cualquier tema de cripto...",
      send: "Enviar",
      analyze: "Analizar Mercado",
      history: "Historial",
      analyzing: "Analizando...",
      typing: "DELFOS está escribiendo...",
      you: "Tú",
      assistant: "DELFOS AI",
      rateLimit: "Límite de solicitudes alcanzado. Inténtalo más tarde.",
      error: "Error al obtener respuesta. Inténtalo de nuevo.",
    },
    "pt-BR": {
      title: "Assistente AI de Mercado",
      description: "Obtenha insights, análises e sugestões de estratégia com AI",
      placeholder: "Pergunte sobre tendências de mercado, estratégias ou qualquer questão sobre cripto...",
      send: "Enviar",
      analyze: "Analisar Mercado",
      history: "Histórico",
      analyzing: "Analisando...",
      typing: "DELFOS está digitando...",
      you: "Você",
      assistant: "DELFOS AI",
      rateLimit: "Limite de requisições atingido. Tente novamente mais tarde.",
      error: "Falha ao obter resposta. Tente novamente.",
    },
  };

  const t = texts[language];

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest<AIResponse>("/api/ai/chat", "POST", { message });
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: any) => {
      console.error("Error:", error);
      alert(error.message || t.error);
    },
  });

  // Market analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<AIAnalysis>("/api/ai/analyze", "GET");
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.analysis,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: any) => {
      console.error("Error:", error);
      alert(error.message || t.error);
    },
  });

  // Rankings insight mutation
  const rankingsInsightMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<AIAnalysis>("/api/ai/rankings-insight", "GET");
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.analysis,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: any) => {
      console.error("Error:", error);
      alert(error.message || t.error);
    },
  });

  // Cluster insight mutation
  const clusterInsightMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<AIAnalysis>("/api/ai/cluster-insight", "GET");
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.analysis,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: any) => {
      console.error("Error:", error);
      alert(error.message || t.error);
    },
  });

  // Risk analysis mutation
  const riskAnalysisMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<AIAnalysis>("/api/ai/risk", "GET");
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.analysis,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (error: any) => {
      console.error("Error:", error);
      alert(error.message || t.error);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate(input);
    setInput("");
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold">{t.title}</h1>
        </div>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <div className="grid gap-6">
        {/* Quick Analysis Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card 
            className="hover-elevate cursor-pointer" 
            onClick={() => !rankingsInsightMutation.isPending && rankingsInsightMutation.mutate()} 
            data-testid="card-rankings-insight"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Rankings
              </CardTitle>
              {rankingsInsightMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Análise dos top ativos selecionados
              </p>
            </CardContent>
          </Card>
          
          <Card 
            className="hover-elevate cursor-pointer" 
            onClick={() => !clusterInsightMutation.isPending && clusterInsightMutation.mutate()} 
            data-testid="card-cluster-insight"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Clusters
              </CardTitle>
              {clusterInsightMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Insights sobre grupos K-means
              </p>
            </CardContent>
          </Card>
          
          <Card 
            className="hover-elevate cursor-pointer" 
            onClick={() => !riskAnalysisMutation.isPending && riskAnalysisMutation.mutate()} 
            data-testid="card-risk-analysis"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Risco
              </CardTitle>
              {riskAnalysisMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Avaliação de perfil de risco
              </p>
            </CardContent>
          </Card>
          
          <Card 
            className="hover-elevate cursor-pointer" 
            onClick={() => !analyzeMutation.isPending && handleAnalyze()} 
            data-testid="card-market-overview"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Mercado
              </CardTitle>
              {analyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Activity className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Visão geral do mercado atual
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Chat com DELFOS AI</CardTitle>
              <CardDescription className="mt-1">
                Análise em tempo real com contexto de mercado
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Comece uma conversa ou solicite uma análise de mercado</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-3 ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                      data-testid={`message-${msg.role}-${idx}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-4 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="text-xs font-semibold mb-1 opacity-70">
                          {msg.role === "user" ? t.you : t.assistant}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        <div className="text-xs opacity-50 mt-2">
                          {msg.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {chatMutation.isPending && (
                  <div className="flex gap-3 justify-start">
                    <div className="bg-muted rounded-lg p-4">
                      <div className="text-xs font-semibold mb-1 opacity-70">
                        {t.assistant}
                      </div>
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{t.typing}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="mt-4 flex gap-2">
              <Textarea
                placeholder={t.placeholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="resize-none"
                rows={3}
                disabled={chatMutation.isPending}
                data-testid="input-chat-message"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                size="icon"
                className="h-auto"
                data-testid="button-send-message"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
