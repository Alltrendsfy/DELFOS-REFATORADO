import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { 
  Users, 
  Plus, 
  Eye,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Building2,
  Search,
  Filter,
  ArrowLeft
} from "lucide-react";

interface MasterAccount {
  id: string;
  legal_entity_name: string;
  legal_entity_tax_id: string;
  legal_entity_tax_id_type: string;
  legal_entity_address: string | null;
  legal_entity_country: string | null;
  territory_definition_id: string;
  status: string;
  franchise_fee_split_pct: string;
  royalty_split_pct: string;
  contract_start_date: string;
  contract_end_date: string | null;
  created_at: string;
}

interface TerritoryDefinition {
  id: string;
  territory_name: string;
  country_code: string;
  state: string;
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
    pending_approval: "Aguardando Aprovação",
    suspended: "Suspenso",
    inactive: "Inativo"
  };

  return (
    <Badge variant={variants[status] || "outline"} data-testid={testId}>
      {labels[status] || status}
    </Badge>
  );
}

function CreateMasterDialog({ territories }: { territories: TerritoryDefinition[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    legal_entity_name: "",
    legal_entity_tax_id: "",
    legal_entity_tax_id_type: "CNPJ",
    legal_entity_address: "",
    legal_entity_country: "BR",
    territory_definition_id: "",
    franchise_fee_split_pct: "30",
    royalty_split_pct: "20",
    contract_start_date: new Date().toISOString().split('T')[0],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("/api/master-accounts", "POST", {
        ...data,
        contract_start_date: new Date(data.contract_start_date),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master-accounts"] });
      toast({ title: "Master criado com sucesso!" });
      setOpen(false);
      setFormData({
        legal_entity_name: "",
        legal_entity_tax_id: "",
        legal_entity_tax_id_type: "CNPJ",
        legal_entity_address: "",
        legal_entity_country: "BR",
        territory_definition_id: "",
        franchise_fee_split_pct: "30",
        royalty_split_pct: "20",
        contract_start_date: new Date().toISOString().split('T')[0],
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao criar Master", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-master">
          <Plus className="w-4 h-4 mr-2" />
          Novo Master
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Master Franqueado</DialogTitle>
          <DialogDescription>
            Cadastre um novo Master Franqueado com direito de expansão comercial em um território.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="legal_entity_name">Razão Social</Label>
              <Input
                id="legal_entity_name"
                value={formData.legal_entity_name}
                onChange={(e) => setFormData({ ...formData, legal_entity_name: e.target.value })}
                placeholder="Nome da empresa"
                data-testid="input-legal-entity-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_entity_tax_id">CNPJ/CPF</Label>
              <Input
                id="legal_entity_tax_id"
                value={formData.legal_entity_tax_id}
                onChange={(e) => setFormData({ ...formData, legal_entity_tax_id: e.target.value })}
                placeholder="00.000.000/0000-00"
                data-testid="input-tax-id"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="legal_entity_address">Endereço</Label>
            <Textarea
              id="legal_entity_address"
              value={formData.legal_entity_address}
              onChange={(e) => setFormData({ ...formData, legal_entity_address: e.target.value })}
              placeholder="Endereço completo"
              data-testid="input-address"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="territory">Território</Label>
              <Select
                value={formData.territory_definition_id}
                onValueChange={(value) => setFormData({ ...formData, territory_definition_id: value })}
              >
                <SelectTrigger data-testid="select-territory">
                  <SelectValue placeholder="Selecione o território" />
                </SelectTrigger>
                <SelectContent>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.territory_name} ({t.state}, {t.country_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract_start_date">Início do Contrato</Label>
              <Input
                id="contract_start_date"
                type="date"
                value={formData.contract_start_date}
                onChange={(e) => setFormData({ ...formData, contract_start_date: e.target.value })}
                data-testid="input-contract-date"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="franchise_fee_split">Split Taxa de Franquia (%)</Label>
              <Input
                id="franchise_fee_split"
                type="number"
                min="0"
                max="100"
                value={formData.franchise_fee_split_pct}
                onChange={(e) => setFormData({ ...formData, franchise_fee_split_pct: e.target.value })}
                data-testid="input-fee-split"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="royalty_split">Split Royalty (%)</Label>
              <Input
                id="royalty_split"
                type="number"
                min="0"
                max="100"
                value={formData.royalty_split_pct}
                onChange={(e) => setFormData({ ...formData, royalty_split_pct: e.target.value })}
                data-testid="input-royalty-split"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={() => createMutation.mutate(formData)}
            disabled={createMutation.isPending || !formData.legal_entity_name || !formData.territory_definition_id}
            data-testid="button-submit-master"
          >
            {createMutation.isPending ? "Criando..." : "Criar Master"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MasterAccounts() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: masters, isLoading } = useQuery<MasterAccount[]>({
    queryKey: ["/api/master-accounts"],
  });

  const { data: territories } = useQuery<TerritoryDefinition[]>({
    queryKey: ["/api/territories"],
  });

  const approveMutation = useMutation({
    mutationFn: async (masterId: string) => {
      return apiRequest(`/api/master-accounts/${masterId}/approve`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master-accounts"] });
      toast({ title: "Master aprovado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao aprovar", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ masterId, reason }: { masterId: string; reason: string }) => {
      return apiRequest(`/api/master-accounts/${masterId}/suspend`, "POST", { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master-accounts"] });
      toast({ title: "Master suspenso!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao suspender", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (masterId: string) => {
      return apiRequest(`/api/master-accounts/${masterId}/reactivate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master-accounts"] });
      toast({ title: "Master reativado!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao reativar", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const filteredMasters = masters?.filter((master) => {
    const matchesSearch = master.legal_entity_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      master.legal_entity_tax_id.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || master.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/master-franchise">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Master Franqueados
          </h1>
          <p className="text-muted-foreground">
            Gerencie os Master Franqueados e seus territórios
          </p>
        </div>
        <CreateMasterDialog territories={territories || []} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48" data-testid="select-status-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending_approval">Aguardando</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="suspended">Suspensos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredMasters && filteredMasters.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Razão Social</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Split Taxa</TableHead>
                    <TableHead>Split Royalty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMasters.map((master) => (
                    <TableRow key={master.id} data-testid={`row-master-${master.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <span data-testid={`text-name-${master.id}`}>{master.legal_entity_name}</span>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-taxid-${master.id}`}>{master.legal_entity_tax_id}</TableCell>
                      <TableCell data-testid={`text-feesplit-${master.id}`}>{master.franchise_fee_split_pct}%</TableCell>
                      <TableCell data-testid={`text-royaltysplit-${master.id}`}>{master.royalty_split_pct}%</TableCell>
                      <TableCell>
                        <StatusBadge status={master.status} testId={`badge-status-${master.id}`} />
                      </TableCell>
                      <TableCell>
                        {new Date(master.contract_start_date).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/master-franchise/accounts/${master.id}`}>
                            <Button variant="ghost" size="icon" data-testid={`button-view-${master.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          {master.status === 'pending_approval' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => approveMutation.mutate(master.id)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${master.id}`}
                            >
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            </Button>
                          )}
                          {(master.status === 'active' || master.status === 'approved') && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => suspendMutation.mutate({ masterId: master.id, reason: "Administrative suspension" })}
                              disabled={suspendMutation.isPending}
                              data-testid={`button-suspend-${master.id}`}
                            >
                              <Pause className="w-4 h-4 text-yellow-500" />
                            </Button>
                          )}
                          {master.status === 'suspended' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => reactivateMutation.mutate(master.id)}
                              disabled={reactivateMutation.isPending}
                              data-testid={`button-reactivate-${master.id}`}
                            >
                              <Play className="w-4 h-4 text-green-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum Master Franqueado encontrado</p>
              {searchQuery && (
                <Button 
                  variant="ghost" 
                  onClick={() => setSearchQuery("")}
                  className="mt-2"
                >
                  Limpar busca
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
