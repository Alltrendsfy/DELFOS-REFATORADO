import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { 
  Users, 
  MapPin, 
  AlertTriangle, 
  TrendingUp, 
  Building2, 
  Shield,
  DollarSign,
  Activity,
  Plus,
  Eye
} from "lucide-react";

interface MasterAccount {
  id: string;
  legal_entity_name: string;
  status: string;
  territory_definition_id: string;
  franchise_fee_split_pct: string;
  royalty_split_pct: string;
  contract_start_date: string;
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

interface TerritoryDefinition {
  id: string;
  territory_name: string;
  country_code: string;
  state: string;
  exclusivity_type: string;
  is_active: boolean;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  description,
  variant = "default",
  testId
}: { 
  title: string; 
  value: string | number; 
  icon: any;
  trend?: string;
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
        {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    approved: "default",
    pending_approval: "secondary",
    suspended: "destructive",
    inactive: "outline"
  };

  const labels: Record<string, string> = {
    active: "Ativo",
    approved: "Aprovado",
    pending_approval: "Aguardando",
    suspended: "Suspenso",
    inactive: "Inativo"
  };

  return (
    <Badge variant={variants[status] || "outline"} data-testid={testId}>
      {labels[status] || status}
    </Badge>
  );
}

export default function MasterFranchiseDashboard() {
  const { t } = useLanguage();

  const { data: masters, isLoading: mastersLoading } = useQuery<MasterAccount[]>({
    queryKey: ["/api/master-accounts"],
  });

  const { data: antifraud, isLoading: antifraudLoading } = useQuery<AntifraudDashboard>({
    queryKey: ["/api/antifraud/dashboard"],
  });

  const { data: territories, isLoading: territoriesLoading } = useQuery<TerritoryDefinition[]>({
    queryKey: ["/api/territories"],
  });

  const activeMasters = masters?.filter(m => m.status === 'active' || m.status === 'approved').length || 0;
  const pendingMasters = masters?.filter(m => m.status === 'pending_approval').length || 0;
  const suspendedMasters = masters?.filter(m => m.status === 'suspended').length || 0;
  const activeAlerts = antifraud?.pendingAlerts || 0;
  const activeTerritoriesCount = territories?.filter(t => t.is_active).length || 0;

  const isLoading = mastersLoading || antifraudLoading || territoriesLoading;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Master Franchise
          </h1>
          <p className="text-muted-foreground">
            Gestão de Master Franqueados e Territórios
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/master-franchise/territories">
            <Button variant="outline" data-testid="button-manage-territories">
              <MapPin className="w-4 h-4 mr-2" />
              Territórios
            </Button>
          </Link>
          <Link href="/master-franchise/accounts">
            <Button data-testid="button-manage-masters">
              <Plus className="w-4 h-4 mr-2" />
              Novo Master
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
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
            title="Masters Ativos"
            value={activeMasters}
            icon={Users}
            description={`${pendingMasters} aguardando aprovação`}
            variant="success"
            testId="stat-active-masters"
          />
          <StatCard
            title="Territórios"
            value={activeTerritoriesCount}
            icon={MapPin}
            description={`${territories?.length || 0} definidos`}
            testId="stat-territories"
          />
          <StatCard
            title="Alertas Antifraude"
            value={activeAlerts}
            icon={AlertTriangle}
            description={`${antifraud?.stats24h.totalEvents || 0} eventos 24h`}
            variant={activeAlerts > 0 ? "danger" : "default"}
            testId="stat-antifraud-alerts"
          />
          <StatCard
            title="Masters Suspensos"
            value={suspendedMasters}
            icon={Shield}
            variant={suspendedMasters > 0 ? "warning" : "default"}
            testId="stat-suspended-masters"
          />
        </div>
      )}

      <Tabs defaultValue="masters" className="space-y-4">
        <TabsList>
          <TabsTrigger value="masters" data-testid="tab-masters">
            <Users className="w-4 h-4 mr-2" />
            Masters
          </TabsTrigger>
          <TabsTrigger value="antifraud" data-testid="tab-antifraud">
            <Shield className="w-4 h-4 mr-2" />
            Antifraude
          </TabsTrigger>
          <TabsTrigger value="territories" data-testid="tab-territories">
            <MapPin className="w-4 h-4 mr-2" />
            Territórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="masters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Master Franqueados Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mastersLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : masters && masters.length > 0 ? (
                <div className="space-y-3">
                  {masters.slice(0, 5).map((master) => (
                    <div
                      key={master.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                      data-testid={`card-master-${master.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{master.legal_entity_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Split: {master.franchise_fee_split_pct}% taxa | {master.royalty_split_pct}% royalty
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={master.status} testId={`badge-status-master-${master.id}`} />
                        <Link href={`/master-franchise/accounts/${master.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-master-${master.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum Master Franqueado cadastrado</p>
                  <Link href="/master-franchise/accounts">
                    <Button variant="outline" className="mt-4" data-testid="button-add-first-master">
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Master
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="antifraud" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title="Eventos 24h"
              value={antifraud?.stats24h.totalEvents || 0}
              icon={Activity}
              variant={antifraud?.stats24h.totalEvents ? "warning" : "default"}
              testId="stat-events-24h"
            />
            <StatCard
              title="Eventos 7 dias"
              value={antifraud?.stats7d.totalEvents || 0}
              icon={TrendingUp}
              testId="stat-events-7d"
            />
            <StatCard
              title="Masters c/ Fraude Ativa"
              value={antifraud?.mastersWithActiveFraud || 0}
              icon={AlertTriangle}
              variant={antifraud?.mastersWithActiveFraud ? "danger" : "success"}
              testId="stat-masters-fraud"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Resumo por Severidade (7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {antifraudLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-lg bg-red-500/10">
                    <p className="text-2xl font-bold text-red-500">
                      {antifraud?.stats7d.bySeverity?.critical || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Crítico</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-orange-500/10">
                    <p className="text-2xl font-bold text-orange-500">
                      {antifraud?.stats7d.bySeverity?.high || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Alto</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-yellow-500/10">
                    <p className="text-2xl font-bold text-yellow-500">
                      {antifraud?.stats7d.bySeverity?.medium || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Médio</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-500/10">
                    <p className="text-2xl font-bold text-blue-500">
                      {antifraud?.stats7d.bySeverity?.low || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Baixo</p>
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Link href="/master-franchise/antifraud">
                  <Button variant="outline" data-testid="button-view-antifraud">
                    Ver Dashboard Completo
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="territories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Territórios Definidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {territoriesLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : territories && territories.length > 0 ? (
                <div className="space-y-3">
                  {territories.slice(0, 5).map((territory) => (
                    <div
                      key={territory.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                      data-testid={`card-territory-${territory.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <MapPin className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{territory.territory_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {territory.state}, {territory.country_code}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={territory.exclusivity_type === 'EXCLUSIVE' ? 'default' : 'secondary'}>
                          {territory.exclusivity_type}
                        </Badge>
                        <Badge variant={territory.is_active ? 'default' : 'outline'}>
                          {territory.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum território definido</p>
                  <Link href="/master-franchise/territories">
                    <Button variant="outline" className="mt-4" data-testid="button-add-first-territory">
                      <Plus className="w-4 h-4 mr-2" />
                      Definir Território
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
