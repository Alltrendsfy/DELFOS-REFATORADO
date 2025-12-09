import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Wallet, TrendingUp, TrendingDown, RefreshCw, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { insertPortfolioSchema, type Portfolio } from "@shared/schema";
import { z } from "zod";

const translations = {
  en: {
    title: "Portfolio Management",
    subtitle: "Create and manage your trading portfolios",
    newPortfolio: "New Portfolio",
    portfolios: "Portfolios",
    noPortfolios: "No portfolios yet",
    noPortfoliosDescription: "Create your first portfolio to start trading",
    createPortfolio: "Create Portfolio",
    portfolioName: "Portfolio Name",
    enterPortfolioName: "Enter portfolio name",
    initialCapital: "Initial Capital (USD)",
    enterInitialCapital: "Enter initial capital",
    cancel: "Cancel",
    create: "Create",
    portfolioCreated: "Portfolio created successfully",
    error: "Error",
    totalValue: "Total Value",
    dailyPnL: "Daily P&L",
    nameRequired: "Portfolio name is required",
    loading: "Loading portfolios...",
    errorLoading: "Failed to load portfolios",
    retry: "Retry",
    creating: "Creating...",
    paperTradingMode: "Paper Trading Mode",
    paperModeDescription: "Simulate trades without real money (recommended for testing)",
    paperModeBadge: "PAPER",
    liveModeBadge: "LIVE",
    delete: "Delete",
    deleteConfirmTitle: "Delete Portfolio",
    deleteConfirmDesc: "Are you sure you want to delete this portfolio? All associated campaigns and data will be permanently deleted.",
    portfolioDeleted: "Portfolio deleted successfully",
    cannotDeleteActive: "Cannot delete portfolio with active campaigns",
    deleting: "Deleting...",
  },
  es: {
    title: "Gestión de Carteras",
    subtitle: "Crea y gestiona tus carteras de trading",
    newPortfolio: "Nueva Cartera",
    portfolios: "Carteras",
    noPortfolios: "Sin carteras aún",
    noPortfoliosDescription: "Crea tu primera cartera para comenzar a operar",
    createPortfolio: "Crear Cartera",
    portfolioName: "Nombre de Cartera",
    enterPortfolioName: "Ingresa nombre de cartera",
    initialCapital: "Capital Inicial (USD)",
    enterInitialCapital: "Ingresa capital inicial",
    cancel: "Cancelar",
    create: "Crear",
    portfolioCreated: "Cartera creada exitosamente",
    error: "Error",
    totalValue: "Valor Total",
    dailyPnL: "P&L Diario",
    nameRequired: "El nombre de cartera es requerido",
    loading: "Cargando carteras...",
    errorLoading: "Error al cargar carteras",
    retry: "Reintentar",
    creating: "Creando...",
    paperTradingMode: "Modo Paper Trading",
    paperModeDescription: "Simular operaciones sin dinero real (recomendado para pruebas)",
    paperModeBadge: "PAPER",
    liveModeBadge: "EN VIVO",
    delete: "Eliminar",
    deleteConfirmTitle: "Eliminar Cartera",
    deleteConfirmDesc: "Estas seguro de que deseas eliminar esta cartera? Todas las campanas y datos asociados seran eliminados permanentemente.",
    portfolioDeleted: "Cartera eliminada exitosamente",
    cannotDeleteActive: "No se puede eliminar cartera con campanas activas",
    deleting: "Eliminando...",
  },
  "pt-BR": {
    title: "Gestão de Carteiras",
    subtitle: "Crie e gerencie suas carteiras de trading",
    newPortfolio: "Nova Carteira",
    portfolios: "Carteiras",
    noPortfolios: "Nenhuma carteira ainda",
    noPortfoliosDescription: "Crie sua primeira carteira para começar a operar",
    createPortfolio: "Criar Carteira",
    portfolioName: "Nome da Carteira",
    enterPortfolioName: "Digite o nome da carteira",
    initialCapital: "Capital Inicial (USD)",
    enterInitialCapital: "Digite o capital inicial",
    cancel: "Cancelar",
    create: "Criar",
    portfolioCreated: "Carteira criada com sucesso",
    error: "Erro",
    totalValue: "Valor Total",
    dailyPnL: "P&L Diário",
    nameRequired: "Nome da carteira é obrigatório",
    loading: "Carregando carteiras...",
    errorLoading: "Erro ao carregar carteiras",
    retry: "Tentar novamente",
    creating: "Criando...",
    paperTradingMode: "Modo Paper Trading",
    paperModeDescription: "Simular operações sem dinheiro real (recomendado para testes)",
    paperModeBadge: "PAPER",
    liveModeBadge: "AO VIVO",
    delete: "Excluir",
    deleteConfirmTitle: "Excluir Carteira",
    deleteConfirmDesc: "Tem certeza que deseja excluir esta carteira? Todas as campanhas e dados associados serao excluidos permanentemente.",
    portfolioDeleted: "Carteira excluida com sucesso",
    cannotDeleteActive: "Nao e possivel excluir carteira com campanhas ativas",
    deleting: "Excluindo...",
  },
};

type CreatePortfolioFormData = {
  name: string;
  total_value_usd?: string;
  trading_mode?: "paper" | "live";
};

export default function Portfolios() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const t = translations[language as keyof typeof translations];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hasAutoOpened = useRef(false);

  // Create dynamic schema with localized messages
  const createPortfolioFormSchema = z.object({
    name: z.string().min(1, t.nameRequired),
    total_value_usd: z.string().optional(),
    trading_mode: z.enum(["paper", "live"]).optional(),
  });

  // Fetch portfolios
  const { data: portfolios, isLoading, isError, error, refetch } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  // Create portfolio mutation
  const createPortfolioMutation = useMutation({
    mutationFn: async (data: CreatePortfolioFormData) => {
      const portfolioData = {
        name: data.name,
        total_value_usd: data.total_value_usd || "0",
        trading_mode: data.trading_mode || "paper",
      };
      return await apiRequest("/api/portfolios", "POST", portfolioData);
    },
    onSuccess: async () => {
      // Close dialog immediately for better UX
      setDialogOpen(false);
      form.reset();
      
      // Then invalidate cache to refresh the list
      await queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      
      // Show success toast after refresh
      toast({ title: t.portfolioCreated });
    },
    onError: (error: any) => {
      const errorMessage = error instanceof Error ? error.message : t.errorLoading;
      toast({ title: t.error, description: errorMessage, variant: "destructive" });
    },
  });

  // Delete portfolio mutation
  const deletePortfolioMutation = useMutation({
    mutationFn: async (portfolioId: string) => {
      setDeletingId(portfolioId);
      return await apiRequest(`/api/portfolios/${portfolioId}`, "DELETE");
    },
    onSuccess: async () => {
      setDeletingId(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      toast({ title: t.portfolioDeleted });
    },
    onError: (error: any) => {
      setDeletingId(null);
      const errorMessage = error?.message?.includes("active campaigns") 
        ? t.cannotDeleteActive 
        : (error instanceof Error ? error.message : t.errorLoading);
      toast({ title: t.error, description: errorMessage, variant: "destructive" });
    },
  });

  // Form setup with zodResolver using dynamic schema
  const form = useForm<CreatePortfolioFormData>({
    resolver: zodResolver(createPortfolioFormSchema),
    defaultValues: {
      name: "",
      total_value_usd: "0",
      trading_mode: "paper",
    },
  });

  const onSubmit = (data: CreatePortfolioFormData) => {
    createPortfolioMutation.mutate(data);
  };

  // Auto-open dialog when no portfolios exist (only once)
  const hasNoPortfolios = portfolios && portfolios.length === 0;

  // Auto-open dialog for empty state (only on first load)
  useEffect(() => {
    if (hasNoPortfolios && !isLoading && !hasAutoOpened.current) {
      setDialogOpen(true);
      hasAutoOpened.current = true;
    }
  }, [hasNoPortfolios, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground" data-testid="text-loading">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-destructive" data-testid="text-error-title">
                {t.error}
              </h2>
              <p className="text-muted-foreground" data-testid="text-error-message">
                {t.errorLoading}
              </p>
              {error && (
                <p className="text-sm text-muted-foreground" data-testid="text-error-details">
                  {(error as Error).message}
                </p>
              )}
            </div>
            <Button onClick={() => refetch()} data-testid="button-retry">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-title">{t.title}</h1>
            <p className="text-muted-foreground" data-testid="text-subtitle">{t.subtitle}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-portfolio">
                <Plus className="h-4 w-4 mr-2" />
                {t.newPortfolio}
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-create-portfolio">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">{t.createPortfolio}</DialogTitle>
                <DialogDescription data-testid="text-dialog-description">
                  {t.noPortfoliosDescription}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-name">{t.portfolioName}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t.enterPortfolioName}
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage data-testid="error-name" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="total_value_usd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-total-value-usd">{t.initialCapital}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            placeholder={t.enterInitialCapital}
                            data-testid="input-total-value-usd"
                          />
                        </FormControl>
                        <FormMessage data-testid="error-total-value-usd" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="trading_mode"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between space-y-0 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base" data-testid="label-trading-mode">
                            {t.paperTradingMode}
                          </FormLabel>
                          <div className="text-sm text-muted-foreground">
                            {t.paperModeDescription}
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value === "paper"}
                            onCheckedChange={(checked) => field.onChange(checked ? "paper" : "live")}
                            data-testid="switch-trading-mode"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      {t.cancel}
                    </Button>
                    <Button
                      type="submit"
                      disabled={createPortfolioMutation.isPending}
                      data-testid="button-create"
                    >
                      {createPortfolioMutation.isPending ? t.creating : t.create}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Empty State */}
        {hasNoPortfolios ? (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Wallet className="h-16 w-16 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-no-portfolios">
                  {t.noPortfolios}
                </h2>
                <p className="text-muted-foreground max-w-md" data-testid="text-no-portfolios-description">
                  {t.noPortfoliosDescription}
                </p>
              </div>
              <Button 
                onClick={() => setDialogOpen(true)} 
                data-testid="button-create-first-portfolio"
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t.createPortfolio}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Portfolios Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolios?.map((portfolio) => {
              const dailyPnL = parseFloat(portfolio.daily_pnl);
              const isPositive = dailyPnL >= 0;
              
              return (
                <Card
                  key={portfolio.id}
                  className="hover-elevate active-elevate-2 cursor-pointer transition-all"
                  data-testid={`card-portfolio-${portfolio.id}`}
                >
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center gap-2" data-testid={`text-portfolio-name-${portfolio.id}`}>
                      <Wallet className="h-5 w-5 text-primary" />
                      {portfolio.name}
                      {portfolio.trading_mode === "paper" ? (
                        <Badge variant="secondary" className="ml-auto" data-testid={`badge-paper-mode-${portfolio.id}`}>
                          {t.paperModeBadge}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="ml-auto" data-testid={`badge-live-mode-${portfolio.id}`}>
                          {t.liveModeBadge}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription data-testid={`text-portfolio-id-${portfolio.id}`}>
                      ID: {portfolio.id.slice(0, 8)}...
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-sm text-muted-foreground">{t.totalValue}</div>
                      <div className="text-2xl font-bold" data-testid={`text-total-value-${portfolio.id}`}>
                        ${parseFloat(portfolio.total_value_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t.dailyPnL}</div>
                      <div
                        className={`flex items-center gap-1 text-lg font-semibold ${
                          isPositive ? "text-green-500" : "text-red-500"
                        }`}
                        data-testid={`text-daily-pnl-${portfolio.id}`}
                      >
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        ${Math.abs(dailyPnL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-sm">
                          ({parseFloat(portfolio.daily_pnl_percentage).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t flex justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={deletingId !== null}
                            data-testid={`button-delete-portfolio-${portfolio.id}`}
                          >
                            {deletingId === portfolio.id ? (
                              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            {deletingId === portfolio.id ? t.deleting : t.delete}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t.deleteConfirmDesc}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePortfolioMutation.mutate(portfolio.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              data-testid={`button-confirm-delete-${portfolio.id}`}
                            >
                              {t.delete}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
