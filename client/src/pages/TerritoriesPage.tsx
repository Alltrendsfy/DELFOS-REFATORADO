import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Search, Globe, Building2, Users, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Territory {
  id: string;
  name: string;
  region: string;
  country: string;
  status: "available" | "assigned" | "reserved";
  assignedTo?: string;
  franchiseCount: number;
  population?: number;
}

export default function TerritoriesPage() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Mock data - in production would come from API
  const territories: Territory[] = [
    { id: "1", name: "São Paulo - Centro", region: "Sudeste", country: "Brasil", status: "assigned", assignedTo: "Franquia Alpha", franchiseCount: 3, population: 12000000 },
    { id: "2", name: "São Paulo - Zona Sul", region: "Sudeste", country: "Brasil", status: "available", franchiseCount: 0, population: 4500000 },
    { id: "3", name: "Rio de Janeiro - Centro", region: "Sudeste", country: "Brasil", status: "assigned", assignedTo: "Franquia Beta", franchiseCount: 2, population: 6700000 },
    { id: "4", name: "Belo Horizonte", region: "Sudeste", country: "Brasil", status: "reserved", franchiseCount: 0, population: 2500000 },
    { id: "5", name: "Curitiba", region: "Sul", country: "Brasil", status: "available", franchiseCount: 0, population: 1900000 },
    { id: "6", name: "Porto Alegre", region: "Sul", country: "Brasil", status: "assigned", assignedTo: "Franquia Gamma", franchiseCount: 1, population: 1400000 },
    { id: "7", name: "Salvador", region: "Nordeste", country: "Brasil", status: "available", franchiseCount: 0, population: 2900000 },
    { id: "8", name: "Recife", region: "Nordeste", country: "Brasil", status: "reserved", franchiseCount: 0, population: 1600000 },
  ];

  const filteredTerritories = territories.filter(territory => {
    const matchesSearch = territory.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         territory.region.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || territory.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: territories.length,
    available: territories.filter(t => t.status === "available").length,
    assigned: territories.filter(t => t.status === "assigned").length,
    reserved: territories.filter(t => t.status === "reserved").length,
  };

  const getStatusBadge = (status: Territory["status"]) => {
    switch (status) {
      case "available":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">{t('territories.available')}</Badge>;
      case "assigned":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">{t('territories.assigned')}</Badge>;
      case "reserved":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{t('territories.reserved')}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-territories-title">{t('territories.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('territories.subtitle')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-territory">
              <Plus className="mr-2 h-4 w-4" />
              {t('territories.createTerritory')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('territories.createTerritory')}</DialogTitle>
              <DialogDescription>{t('territories.createDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('territories.name')}</Label>
                <Input placeholder={t('territories.namePlaceholder')} data-testid="input-territory-name" />
              </div>
              <div className="space-y-2">
                <Label>{t('territories.region')}</Label>
                <Input placeholder={t('territories.regionPlaceholder')} data-testid="input-territory-region" />
              </div>
              <div className="space-y-2">
                <Label>{t('territories.country')}</Label>
                <Input placeholder={t('territories.countryPlaceholder')} data-testid="input-territory-country" />
              </div>
              <div className="space-y-2">
                <Label>{t('territories.population')}</Label>
                <Input type="number" placeholder="0" data-testid="input-territory-population" />
              </div>
              <Button className="w-full" data-testid="button-save-territory">
                {t('common.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('territories.totalTerritories')}</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-territories">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('territories.available')}</CardTitle>
            <MapPin className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500" data-testid="text-available-territories">{stats.available}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('territories.assigned')}</CardTitle>
            <Building2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500" data-testid="text-assigned-territories">{stats.assigned}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('territories.reserved')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500" data-testid="text-reserved-territories">{stats.reserved}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('territories.territoryList')}</CardTitle>
          <CardDescription>{t('territories.territoryListDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t('territories.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-territories"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
                <SelectValue placeholder={t('territories.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('territories.allStatuses')}</SelectItem>
                <SelectItem value="available">{t('territories.available')}</SelectItem>
                <SelectItem value="assigned">{t('territories.assigned')}</SelectItem>
                <SelectItem value="reserved">{t('territories.reserved')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('territories.name')}</TableHead>
                <TableHead>{t('territories.region')}</TableHead>
                <TableHead>{t('territories.country')}</TableHead>
                <TableHead>{t('territories.status')}</TableHead>
                <TableHead>{t('territories.assignedTo')}</TableHead>
                <TableHead>{t('territories.franchises')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTerritories.map((territory) => (
                <TableRow key={territory.id} data-testid={`row-territory-${territory.id}`}>
                  <TableCell className="font-medium">{territory.name}</TableCell>
                  <TableCell>{territory.region}</TableCell>
                  <TableCell>{territory.country}</TableCell>
                  <TableCell>{getStatusBadge(territory.status)}</TableCell>
                  <TableCell>{territory.assignedTo || "-"}</TableCell>
                  <TableCell>{territory.franchiseCount}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" data-testid={`button-view-territory-${territory.id}`}>
                      {t('common.view')}
                    </Button>
                    <Button variant="ghost" size="sm" data-testid={`button-edit-territory-${territory.id}`}>
                      {t('common.edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
