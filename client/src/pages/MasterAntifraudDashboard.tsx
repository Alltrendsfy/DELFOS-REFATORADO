import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { 
  Shield, 
  AlertTriangle, 
  Bell,
  CheckCircle,
  XCircle,
  Eye,
  Filter,
  Search,
  ArrowLeft,
  Activity,
  TrendingUp,
  Clock,
  MapPin
} from "lucide-react";

interface FraudEvent {
  id: string;
  master_account_id: string;
  fraud_type: string;
  severity: string;
  status: string;
  detection_source: string;
  evidence: any;
  auto_action_taken: string | null;
  detected_at: string;
  resolved_at: string | null;
}

interface FraudAlert {
  id: string;
  fraud_event_id: string;
  alert_message: string;
  priority: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

interface AntifraudDashboard {
  stats24h: {
    totalEvents: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  stats7d: {
    totalEvents: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  mastersWithActiveFraud: number;
  pendingAlerts: number;
}

function SeverityBadge({ severity, testId }: { severity: string; testId?: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    critical: "destructive",
    high: "destructive",
    medium: "secondary",
    low: "outline"
  };

  return (
    <Badge variant={variants[severity] || "outline"} data-testid={testId}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    detected: "secondary",
    investigating: "default",
    confirmed: "destructive",
    false_positive: "outline",
    resolved: "outline",
    escalated: "destructive"
  };

  const labels: Record<string, string> = {
    detected: "Detectado",
    investigating: "Investigando",
    confirmed: "Confirmado",
    false_positive: "Falso Positivo",
    resolved: "Resolvido",
    escalated: "Escalado"
  };

  return (
    <Badge variant={variants[status] || "outline"} data-testid={testId}>
      {labels[status] || status}
    </Badge>
  );
}

function FraudTypeBadge({ type, testId }: { type: string; testId?: string }) {
  const labels: Record<string, string> = {
    MASTER_TERRITORY_OVERREACH: "Fora do Território",
    MASTER_UNAUTHORIZED_SALE: "Venda Não Autorizada",
    MASTER_OVERLAP_BREACH: "Violação de Overlap",
    MASTER_SELF_SPLIT_ATTEMPT: "Auto-Royalty",
    MASTER_DATA_MANIPULATION: "Manipulação de Dados",
    MASTER_PRIVILEGE_ESCALATION: "Escalação de Privilégio"
  };

  return (
    <Badge variant="outline" data-testid={testId}>
      {labels[type] || type}
    </Badge>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  variant = "default",
  testId
}: { 
  title: string; 
  value: string | number; 
  icon: any;
  description?: string;
  variant?: "default" | "warning" | "success" | "danger";
  testId?: string;
}) {
  const variantStyles = {
    default: "text-primary",
    warning: "text-yellow-500",
    success: "text-green-500",
    danger: "text-red-500"
  };

  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${variantStyles[variant]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={testId ? `${testId}-value` : undefined}>{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function MasterAntifraudDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<FraudEvent | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({ status: "", notes: "" });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<AntifraudDashboard>({
    queryKey: ["/api/antifraud/dashboard"],
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: FraudEvent[], total: number }>({
    queryKey: ["/api/antifraud/events", statusFilter, severityFilter],
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<FraudAlert[]>({
    queryKey: ["/api/antifraud/alerts"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ eventId, status, notes }: { eventId: string; status: string; notes: string }) => {
      return apiRequest(`/api/antifraud/events/${eventId}/status`, "POST", { status, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/antifraud/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/antifraud/dashboard"] });
      toast({ title: "Status atualizado!" });
      setUpdateDialogOpen(false);
      setSelectedEvent(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao atualizar", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest(`/api/antifraud/alerts/${alertId}/acknowledge`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/antifraud/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/antifraud/dashboard"] });
      toast({ title: "Alerta reconhecido!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const events = eventsData?.events || [];
  const pendingAlerts = alerts?.filter(a => !a.acknowledged) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/master-franchise">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            <Shield className="w-8 h-8 inline-block mr-2" />
            Antifraud Dashboard
          </h1>
          <p className="text-muted-foreground">
            Monitoramento e gestão de eventos de fraude em Master Franquias
          </p>
        </div>
      </div>

      {dashboardLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Eventos 24h"
            value={dashboard?.stats24h.totalEvents || 0}
            icon={Activity}
            variant={dashboard?.stats24h.totalEvents ? "warning" : "default"}
            testId="stat-antifraud-24h"
          />
          <StatCard
            title="Eventos 7 dias"
            value={dashboard?.stats7d.totalEvents || 0}
            icon={TrendingUp}
            testId="stat-antifraud-7d"
          />
          <StatCard
            title="Masters c/ Fraude"
            value={dashboard?.mastersWithActiveFraud || 0}
            icon={AlertTriangle}
            variant={dashboard?.mastersWithActiveFraud ? "danger" : "success"}
            testId="stat-antifraud-masters"
          />
          <StatCard
            title="Alertas Pendentes"
            value={dashboard?.pendingAlerts || 0}
            icon={Bell}
            variant={dashboard?.pendingAlerts ? "warning" : "default"}
            testId="stat-antifraud-pending"
          />
        </div>
      )}

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events" data-testid="tab-events">
            <Shield className="w-4 h-4 mr-2" />
            Eventos ({events.length})
          </TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            <Bell className="w-4 h-4 mr-2" />
            Alertas ({pendingAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">
            <Activity className="w-4 h-4 mr-2" />
            Estatísticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <CardTitle className="flex-1">Eventos de Fraude</CardTitle>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40" data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="detected">Detectado</SelectItem>
                      <SelectItem value="investigating">Investigando</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="resolved">Resolvido</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-40" data-testid="select-severity-filter">
                      <SelectValue placeholder="Severidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="critical">Crítico</SelectItem>
                      <SelectItem value="high">Alto</SelectItem>
                      <SelectItem value="medium">Médio</SelectItem>
                      <SelectItem value="low">Baixo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : events.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Severidade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ação Auto</TableHead>
                        <TableHead>Detectado</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event) => (
                        <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                          <TableCell>
                            <FraudTypeBadge type={event.fraud_type} testId={`badge-type-${event.id}`} />
                          </TableCell>
                          <TableCell>
                            <SeverityBadge severity={event.severity} testId={`badge-severity-${event.id}`} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={event.status} testId={`badge-status-${event.id}`} />
                          </TableCell>
                          <TableCell>
                            {event.auto_action_taken ? (
                              <Badge variant="outline">{event.auto_action_taken}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {new Date(event.detected_at).toLocaleString('pt-BR')}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  setSelectedEvent(event);
                                  setUpdateDialogOpen(true);
                                  setStatusUpdate({ status: event.status, notes: "" });
                                }}
                                data-testid={`button-update-${event.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum evento de fraude encontrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertas Pendentes</CardTitle>
              <CardDescription>
                Alertas que requerem atenção imediata
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : pendingAlerts.length > 0 ? (
                <div className="space-y-3">
                  {pendingAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-yellow-500/5 border-yellow-500/20"
                      data-testid={`card-alert-${alert.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                          <Bell className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div>
                          <p className="font-medium">{alert.alert_message}</p>
                          <p className="text-sm text-muted-foreground">
                            Prioridade: <Badge variant="outline">{alert.priority}</Badge>
                            {" · "}
                            {new Date(alert.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="outline"
                        onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                        disabled={acknowledgeAlertMutation.isPending}
                        data-testid={`button-ack-${alert.id}`}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Reconhecer
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50 text-green-500" />
                  <p>Nenhum alerta pendente</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Por Tipo (7 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(dashboard?.stats7d.byType || {}).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between p-3 border rounded-lg">
                        <FraudTypeBadge type={type} />
                        <span className="text-2xl font-bold">{count}</span>
                      </div>
                    ))}
                    {Object.keys(dashboard?.stats7d.byType || {}).length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        Sem eventos nos últimos 7 dias
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por Severidade (7 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 rounded-lg bg-red-500/10">
                      <p className="text-3xl font-bold text-red-500">
                        {dashboard?.stats7d.bySeverity?.critical || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Crítico</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-orange-500/10">
                      <p className="text-3xl font-bold text-orange-500">
                        {dashboard?.stats7d.bySeverity?.high || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Alto</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-yellow-500/10">
                      <p className="text-3xl font-bold text-yellow-500">
                        {dashboard?.stats7d.bySeverity?.medium || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Médio</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-blue-500/10">
                      <p className="text-3xl font-bold text-blue-500">
                        {dashboard?.stats7d.bySeverity?.low || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Baixo</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Status do Evento</DialogTitle>
            <DialogDescription>
              Evento: {selectedEvent?.fraud_type}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Novo Status</Label>
              <Select 
                value={statusUpdate.status} 
                onValueChange={(value) => setStatusUpdate({ ...statusUpdate, status: value })}
              >
                <SelectTrigger data-testid="select-new-status">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="investigating">Investigando</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="false_positive">Falso Positivo</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                  <SelectItem value="escalated">Escalado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={statusUpdate.notes}
                onChange={(e) => setStatusUpdate({ ...statusUpdate, notes: e.target.value })}
                placeholder="Adicione notas sobre esta atualização..."
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (selectedEvent) {
                  updateStatusMutation.mutate({
                    eventId: selectedEvent.id,
                    status: statusUpdate.status,
                    notes: statusUpdate.notes
                  });
                }
              }}
              disabled={updateStatusMutation.isPending || !statusUpdate.status}
              data-testid="button-submit-status"
            >
              {updateStatusMutation.isPending ? "Atualizando..." : "Atualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
