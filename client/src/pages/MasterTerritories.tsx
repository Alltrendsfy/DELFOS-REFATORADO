import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  MapPin, 
  Plus, 
  Eye,
  Pencil,
  Search,
  Filter,
  ArrowLeft,
  Globe,
  Map,
  Check,
  X
} from "lucide-react";

interface TerritoryDefinition {
  id: string;
  territory_name: string;
  country_code: string;
  state: string | null;
  city: string | null;
  microregion: string | null;
  metropolitan_area: string | null;
  zip_range_start: string | null;
  zip_range_end: string | null;
  zip_exclusions: string[] | null;
  custom_zone_definition: any | null;
  exclusivity_type: string;
  max_masters_quota: number | null;
  is_active: boolean;
  created_at: string;
}

function ExclusivityBadge({ type, testId }: { type: string; testId?: string }) {
  const variants: Record<string, "default" | "secondary" | "outline"> = {
    EXCLUSIVE: "default",
    SEMI_EXCLUSIVE: "secondary",
    NON_EXCLUSIVE: "outline"
  };

  const labels: Record<string, string> = {
    EXCLUSIVE: "Exclusivo",
    SEMI_EXCLUSIVE: "Semi-Exclusivo",
    NON_EXCLUSIVE: "Não-Exclusivo"
  };

  return (
    <Badge variant={variants[type] || "outline"} data-testid={testId}>
      {labels[type] || type}
    </Badge>
  );
}

function CreateTerritoryDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    territory_name: "",
    country_code: "BR",
    state: "",
    city: "",
    microregion: "",
    metropolitan_area: "",
    zip_range_start: "",
    zip_range_end: "",
    exclusivity_type: "EXCLUSIVE",
    max_masters_quota: "",
    is_active: true,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("/api/territories", "POST", {
        ...data,
        max_masters_quota: data.max_masters_quota ? parseInt(data.max_masters_quota) : null,
        city: data.city || null,
        microregion: data.microregion || null,
        metropolitan_area: data.metropolitan_area || null,
        zip_range_start: data.zip_range_start || null,
        zip_range_end: data.zip_range_end || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/territories"] });
      toast({ title: "Território criado com sucesso!" });
      setOpen(false);
      setFormData({
        territory_name: "",
        country_code: "BR",
        state: "",
        city: "",
        microregion: "",
        metropolitan_area: "",
        zip_range_start: "",
        zip_range_end: "",
        exclusivity_type: "EXCLUSIVE",
        max_masters_quota: "",
        is_active: true,
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao criar território", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-territory">
          <Plus className="w-4 h-4 mr-2" />
          Novo Território
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Definir Novo Território</DialogTitle>
          <DialogDescription>
            Configure os limites geográficos e regras de exclusividade do território.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="territory_name">Nome do Território</Label>
              <Input
                id="territory_name"
                value={formData.territory_name}
                onChange={(e) => setFormData({ ...formData, territory_name: e.target.value })}
                placeholder="Ex: Grande São Paulo"
                data-testid="input-territory-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country_code">País</Label>
              <Select
                value={formData.country_code}
                onValueChange={(value) => setFormData({ ...formData, country_code: value })}
              >
                <SelectTrigger data-testid="select-country">
                  <SelectValue placeholder="Selecione o país" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BR">Brasil</SelectItem>
                  <SelectItem value="US">Estados Unidos</SelectItem>
                  <SelectItem value="PT">Portugal</SelectItem>
                  <SelectItem value="ES">Espanha</SelectItem>
                  <SelectItem value="MX">México</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="state">Estado/Região</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="Ex: SP"
                data-testid="input-state"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade (opcional)</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Ex: São Paulo"
                data-testid="input-city"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="microregion">Microrregião (IBGE)</Label>
              <Input
                id="microregion"
                value={formData.microregion}
                onChange={(e) => setFormData({ ...formData, microregion: e.target.value })}
                placeholder="Código IBGE"
                data-testid="input-microregion"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metropolitan_area">Região Metropolitana</Label>
              <Input
                id="metropolitan_area"
                value={formData.metropolitan_area}
                onChange={(e) => setFormData({ ...formData, metropolitan_area: e.target.value })}
                placeholder="Ex: RMSP"
                data-testid="input-metropolitan"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zip_range_start">CEP Inicial</Label>
              <Input
                id="zip_range_start"
                value={formData.zip_range_start}
                onChange={(e) => setFormData({ ...formData, zip_range_start: e.target.value })}
                placeholder="01000-000"
                data-testid="input-zip-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip_range_end">CEP Final</Label>
              <Input
                id="zip_range_end"
                value={formData.zip_range_end}
                onChange={(e) => setFormData({ ...formData, zip_range_end: e.target.value })}
                placeholder="09999-999"
                data-testid="input-zip-end"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exclusivity_type">Tipo de Exclusividade</Label>
              <Select
                value={formData.exclusivity_type}
                onValueChange={(value) => setFormData({ ...formData, exclusivity_type: value })}
              >
                <SelectTrigger data-testid="select-exclusivity">
                  <SelectValue placeholder="Tipo de exclusividade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXCLUSIVE">Exclusivo</SelectItem>
                  <SelectItem value="SEMI_EXCLUSIVE">Semi-Exclusivo</SelectItem>
                  <SelectItem value="NON_EXCLUSIVE">Não-Exclusivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.exclusivity_type === "SEMI_EXCLUSIVE" && (
              <div className="space-y-2">
                <Label htmlFor="max_masters_quota">Cota Máxima de Masters</Label>
                <Input
                  id="max_masters_quota"
                  type="number"
                  min="2"
                  value={formData.max_masters_quota}
                  onChange={(e) => setFormData({ ...formData, max_masters_quota: e.target.value })}
                  placeholder="Ex: 3"
                  data-testid="input-quota"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              data-testid="switch-active"
            />
            <Label htmlFor="is_active">Território Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={() => createMutation.mutate(formData)}
            disabled={createMutation.isPending || !formData.territory_name || !formData.state}
            data-testid="button-submit-territory"
          >
            {createMutation.isPending ? "Criando..." : "Criar Território"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MasterTerritories() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [exclusivityFilter, setExclusivityFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const { data: territories, isLoading } = useQuery<TerritoryDefinition[]>({
    queryKey: ["/api/territories"],
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest(`/api/territories/${id}`, "PATCH", { is_active: isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/territories"] });
      toast({ title: "Território atualizado!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao atualizar", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const filteredTerritories = territories?.filter((territory) => {
    const matchesSearch = territory.territory_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (territory.state?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (territory.city?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesExclusivity = exclusivityFilter === "all" || territory.exclusivity_type === exclusivityFilter;
    const matchesActive = activeFilter === "all" || 
      (activeFilter === "active" && territory.is_active) ||
      (activeFilter === "inactive" && !territory.is_active);
    return matchesSearch && matchesExclusivity && matchesActive;
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
            <MapPin className="w-8 h-8 inline-block mr-2" />
            Territórios
          </h1>
          <p className="text-muted-foreground">
            Defina e gerencie os territórios para Master Franqueados
          </p>
        </div>
        <CreateTerritoryDialog />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, estado ou cidade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={exclusivityFilter} onValueChange={setExclusivityFilter}>
              <SelectTrigger className="w-48" data-testid="select-exclusivity-filter">
                <SelectValue placeholder="Exclusividade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="EXCLUSIVE">Exclusivo</SelectItem>
                <SelectItem value="SEMI_EXCLUSIVE">Semi-Exclusivo</SelectItem>
                <SelectItem value="NON_EXCLUSIVE">Não-Exclusivo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-36" data-testid="select-active-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
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
          ) : filteredTerritories && filteredTerritories.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>CEP</TableHead>
                    <TableHead>Exclusividade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTerritories.map((territory) => (
                    <TableRow key={territory.id} data-testid={`row-territory-${territory.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span data-testid={`text-name-${territory.id}`}>{territory.territory_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm" data-testid={`text-location-${territory.id}`}>
                          <Globe className="w-3 h-3" />
                          {territory.city && `${territory.city}, `}
                          {territory.state}, {territory.country_code}
                        </div>
                      </TableCell>
                      <TableCell>
                        {territory.zip_range_start && territory.zip_range_end ? (
                          <span className="text-sm text-muted-foreground">
                            {territory.zip_range_start} - {territory.zip_range_end}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ExclusivityBadge type={territory.exclusivity_type} testId={`badge-exclusivity-${territory.id}`} />
                        {territory.max_masters_quota && (
                          <span className="ml-2 text-xs text-muted-foreground" data-testid={`text-quota-${territory.id}`}>
                            (max: {territory.max_masters_quota})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={territory.is_active ? "default" : "outline"} data-testid={`badge-active-${territory.id}`}>
                          {territory.is_active ? (
                            <><Check className="w-3 h-3 mr-1" /> Ativo</>
                          ) : (
                            <><X className="w-3 h-3 mr-1" /> Inativo</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => toggleActiveMutation.mutate({ 
                              id: territory.id, 
                              isActive: !territory.is_active 
                            })}
                            disabled={toggleActiveMutation.isPending}
                            data-testid={`button-toggle-${territory.id}`}
                          >
                            {territory.is_active ? (
                              <X className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <Check className="w-4 h-4 text-green-500" />
                            )}
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
              <Map className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum território encontrado</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Camadas de Território
          </CardTitle>
          <CardDescription>
            Os territórios podem ser definidos usando múltiplas camadas geográficas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Camadas Administrativas</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• País</li>
                <li>• Estado/Região</li>
                <li>• Município/Cidade</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Camadas Estatísticas (IBGE)</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Microrregião</li>
                <li>• Região Metropolitana</li>
                <li>• Aglomerações Urbanas</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">Camadas Postais</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Faixas de CEP</li>
                <li>• Exclusões de CEP</li>
                <li>• Zonas customizadas</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
