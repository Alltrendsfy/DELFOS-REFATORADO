import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Plus, Search, Users, MapPin, TrendingUp, DollarSign, Calendar } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface MasterFranchise {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  region: string;
  country: string;
  status: "active" | "pending" | "suspended";
  franchiseCount: number;
  territoryCount: number;
  monthlyRevenue: number;
  joinedDate: string;
}

export default function MasterFranchisesPage() {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Mock data - in production would come from API
  const masterFranchises: MasterFranchise[] = [
    { 
      id: "1", 
      name: "DELFOS Sudeste", 
      ownerName: "Carlos Silva", 
      email: "carlos@delfos-sudeste.com",
      region: "Sudeste", 
      country: "Brasil", 
      status: "active", 
      franchiseCount: 12,
      territoryCount: 4,
      monthlyRevenue: 125000,
      joinedDate: "2024-01-15"
    },
    { 
      id: "2", 
      name: "DELFOS Sul", 
      ownerName: "Ana Rodrigues", 
      email: "ana@delfos-sul.com",
      region: "Sul", 
      country: "Brasil", 
      status: "active", 
      franchiseCount: 8,
      territoryCount: 3,
      monthlyRevenue: 89000,
      joinedDate: "2024-03-20"
    },
    { 
      id: "3", 
      name: "DELFOS Nordeste", 
      ownerName: "Roberto Santos", 
      email: "roberto@delfos-nordeste.com",
      region: "Nordeste", 
      country: "Brasil", 
      status: "pending", 
      franchiseCount: 0,
      territoryCount: 5,
      monthlyRevenue: 0,
      joinedDate: "2024-11-01"
    },
    { 
      id: "4", 
      name: "DELFOS Centro-Oeste", 
      ownerName: "Maria Costa", 
      email: "maria@delfos-co.com",
      region: "Centro-Oeste", 
      country: "Brasil", 
      status: "active", 
      franchiseCount: 5,
      territoryCount: 2,
      monthlyRevenue: 45000,
      joinedDate: "2024-06-10"
    },
    { 
      id: "5", 
      name: "DELFOS México", 
      ownerName: "Juan Hernández", 
      email: "juan@delfos-mexico.com",
      region: "Central", 
      country: "México", 
      status: "suspended", 
      franchiseCount: 3,
      territoryCount: 2,
      monthlyRevenue: 0,
      joinedDate: "2024-02-28"
    },
  ];

  const filteredMasterFranchises = masterFranchises.filter(mf => 
    mf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mf.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mf.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: masterFranchises.length,
    active: masterFranchises.filter(mf => mf.status === "active").length,
    totalFranchises: masterFranchises.reduce((sum, mf) => sum + mf.franchiseCount, 0),
    totalRevenue: masterFranchises.reduce((sum, mf) => sum + mf.monthlyRevenue, 0),
  };

  const getStatusBadge = (status: MasterFranchise["status"]) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">{t('masterFranchises.active')}</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{t('masterFranchises.pending')}</Badge>;
      case "suspended":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">{t('masterFranchises.suspended')}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-master-franchises-title">{t('masterFranchises.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('masterFranchises.subtitle')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-master-franchise">
              <Plus className="mr-2 h-4 w-4" />
              {t('masterFranchises.createMaster')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('masterFranchises.createMaster')}</DialogTitle>
              <DialogDescription>{t('masterFranchises.createDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('masterFranchises.franchiseName')}</Label>
                <Input placeholder={t('masterFranchises.franchiseNamePlaceholder')} data-testid="input-master-name" />
              </div>
              <div className="space-y-2">
                <Label>{t('masterFranchises.ownerName')}</Label>
                <Input placeholder={t('masterFranchises.ownerNamePlaceholder')} data-testid="input-owner-name" />
              </div>
              <div className="space-y-2">
                <Label>{t('masterFranchises.email')}</Label>
                <Input type="email" placeholder="email@example.com" data-testid="input-master-email" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('masterFranchises.region')}</Label>
                  <Input placeholder={t('masterFranchises.regionPlaceholder')} data-testid="input-master-region" />
                </div>
                <div className="space-y-2">
                  <Label>{t('masterFranchises.country')}</Label>
                  <Input placeholder={t('masterFranchises.countryPlaceholder')} data-testid="input-master-country" />
                </div>
              </div>
              <Button className="w-full" data-testid="button-save-master-franchise">
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
            <CardTitle className="text-sm font-medium">{t('masterFranchises.totalMasters')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-masters">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('masterFranchises.activeMasters')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500" data-testid="text-active-masters">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('masterFranchises.totalFranchises')}</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500" data-testid="text-total-franchises">{stats.totalFranchises}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('masterFranchises.monthlyRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500" data-testid="text-monthly-revenue">
              {formatCurrency(stats.totalRevenue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Master Franchises List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('masterFranchises.masterList')}</CardTitle>
          <CardDescription>{t('masterFranchises.masterListDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t('masterFranchises.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-master-franchises"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('masterFranchises.franchise')}</TableHead>
                <TableHead>{t('masterFranchises.owner')}</TableHead>
                <TableHead>{t('masterFranchises.region')}</TableHead>
                <TableHead>{t('masterFranchises.status')}</TableHead>
                <TableHead>{t('masterFranchises.franchises')}</TableHead>
                <TableHead>{t('masterFranchises.territories')}</TableHead>
                <TableHead>{t('masterFranchises.revenue')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMasterFranchises.map((mf) => (
                <TableRow key={mf.id} data-testid={`row-master-franchise-${mf.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{mf.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{mf.name}</div>
                        <div className="text-sm text-muted-foreground">{mf.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{mf.ownerName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {mf.region}, {mf.country}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(mf.status)}</TableCell>
                  <TableCell>{mf.franchiseCount}</TableCell>
                  <TableCell>{mf.territoryCount}</TableCell>
                  <TableCell>{formatCurrency(mf.monthlyRevenue)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" data-testid={`button-view-master-${mf.id}`}>
                      {t('common.view')}
                    </Button>
                    <Button variant="ghost" size="sm" data-testid={`button-edit-master-${mf.id}`}>
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
