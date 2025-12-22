import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePersona } from "@/hooks/usePersona";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Eye, 
  Search, 
  Loader2,
  Users,
  UserCheck,
  UserX,
  Mail,
  Phone,
  MapPin,
  Building2,
  FileText,
  ShieldAlert,
  Paperclip,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import type { FranchiseLead } from "@shared/schema";

const translations = {
  en: {
    title: "Lead Management",
    subtitle: "Review and manage franchise applications",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    all: "All",
    search: "Search by name, code or email...",
    noLeads: "No leads found",
    viewDetails: "View Details",
    approve: "Approve",
    reject: "Reject",
    approving: "Approving...",
    rejecting: "Rejecting...",
    leadDetails: "Lead Details",
    personalInfo: "Personal Information",
    contactInfo: "Contact Information",
    addressInfo: "Address",
    additionalNotes: "Additional Notes",
    franchiseCode: "Franchise Code",
    name: "Name",
    tradeName: "Trade Name",
    document: "Document",
    secondaryDocument: "RG / State Registration",
    birthDate: "Birth Date",
    email: "Email",
    phone: "Phone",
    whatsapp: "WhatsApp",
    street: "Street",
    number: "Number",
    complement: "Complement",
    reference: "Reference",
    neighborhood: "Neighborhood",
    zipCode: "ZIP Code",
    city: "City",
    country: "Country",
    documents: "Documents",
    noDocuments: "No documents uploaded",
    viewDocument: "View",
    submittedAt: "Submitted At",
    rejectionReason: "Reason for Rejection",
    rejectionPlaceholder: "Explain why this application was rejected...",
    approveConfirm: "Approve Application",
    approveMessage: "This will create a franchise account and send an activation email to the applicant.",
    rejectConfirm: "Reject Application",
    rejectMessage: "This will notify the applicant that their application was not approved.",
    cancel: "Cancel",
    confirm: "Confirm",
    successApproved: "Lead approved successfully! Activation email sent.",
    successRejected: "Lead rejected. Notification sent to applicant.",
    stats: {
      total: "Total Leads",
      pending: "Pending Review",
      approved: "Approved",
      rejected: "Rejected",
    },
    accessDenied: "Access Denied",
    accessDeniedMessage: "You do not have permission to access this page. Only Franchisor personnel can manage franchise leads.",
    returnHome: "Return to Home",
    loadingPermissions: "Loading permissions...",
  },
  es: {
    title: "Gestión de Leads",
    subtitle: "Revise y gestione las solicitudes de franquicia",
    pending: "Pendientes",
    approved: "Aprobados",
    rejected: "Rechazados",
    all: "Todos",
    search: "Buscar por nombre, código o email...",
    noLeads: "No se encontraron leads",
    viewDetails: "Ver Detalles",
    approve: "Aprobar",
    reject: "Rechazar",
    approving: "Aprobando...",
    rejecting: "Rechazando...",
    leadDetails: "Detalles del Lead",
    personalInfo: "Información Personal",
    contactInfo: "Información de Contacto",
    addressInfo: "Dirección",
    additionalNotes: "Notas Adicionales",
    franchiseCode: "Código de Franquicia",
    name: "Nombre",
    tradeName: "Nombre Comercial",
    document: "Documento",
    secondaryDocument: "RG / Inscripción Estadual",
    birthDate: "Fecha de Nacimiento",
    email: "Email",
    phone: "Teléfono",
    whatsapp: "WhatsApp",
    street: "Calle",
    number: "Número",
    complement: "Complemento",
    reference: "Referencia",
    neighborhood: "Barrio",
    zipCode: "Código Postal",
    city: "Ciudad",
    country: "País",
    documents: "Documentos",
    noDocuments: "Ningún documento subido",
    viewDocument: "Ver",
    submittedAt: "Enviado el",
    rejectionReason: "Razón del Rechazo",
    rejectionPlaceholder: "Explique por qué esta solicitud fue rechazada...",
    approveConfirm: "Aprobar Solicitud",
    approveMessage: "Esto creará una cuenta de franquicia y enviará un email de activación al solicitante.",
    rejectConfirm: "Rechazar Solicitud",
    rejectMessage: "Esto notificará al solicitante que su solicitud no fue aprobada.",
    cancel: "Cancelar",
    confirm: "Confirmar",
    successApproved: "Lead aprobado con éxito! Email de activación enviado.",
    successRejected: "Lead rechazado. Notificación enviada al solicitante.",
    stats: {
      total: "Total de Leads",
      pending: "Pendientes de Revisión",
      approved: "Aprobados",
      rejected: "Rechazados",
    },
    accessDenied: "Acceso Denegado",
    accessDeniedMessage: "No tiene permiso para acceder a esta página. Solo el personal de Franquiciadora puede gestionar leads de franquicia.",
    returnHome: "Volver al Inicio",
    loadingPermissions: "Cargando permisos...",
  },
  "pt-BR": {
    title: "Gestão de Leads",
    subtitle: "Revise e gerencie as candidaturas de franquia",
    pending: "Pendentes",
    approved: "Aprovados",
    rejected: "Rejeitados",
    all: "Todos",
    search: "Buscar por nome, código ou email...",
    noLeads: "Nenhum lead encontrado",
    viewDetails: "Ver Detalhes",
    approve: "Aprovar",
    reject: "Rejeitar",
    approving: "Aprovando...",
    rejecting: "Rejeitando...",
    leadDetails: "Detalhes do Lead",
    personalInfo: "Informações Pessoais",
    contactInfo: "Informações de Contato",
    addressInfo: "Endereço",
    additionalNotes: "Observações",
    franchiseCode: "Código de Franquia",
    name: "Nome",
    tradeName: "Nome Fantasia",
    document: "Documento",
    secondaryDocument: "RG / Inscrição Estadual",
    birthDate: "Data de Nascimento",
    email: "E-mail",
    phone: "Telefone",
    whatsapp: "WhatsApp",
    street: "Rua",
    number: "Número",
    complement: "Complemento",
    reference: "Referência",
    neighborhood: "Bairro",
    zipCode: "CEP",
    city: "Cidade",
    country: "País",
    documents: "Documentos",
    noDocuments: "Nenhum documento enviado",
    viewDocument: "Ver",
    submittedAt: "Enviado em",
    rejectionReason: "Motivo da Rejeição",
    rejectionPlaceholder: "Explique por que esta candidatura foi rejeitada...",
    approveConfirm: "Aprovar Candidatura",
    approveMessage: "Isso criará uma conta de franquia e enviará um e-mail de ativação ao candidato.",
    rejectConfirm: "Rejeitar Candidatura",
    rejectMessage: "Isso notificará o candidato de que sua candidatura não foi aprovada.",
    cancel: "Cancelar",
    confirm: "Confirmar",
    successApproved: "Lead aprovado com sucesso! E-mail de ativação enviado.",
    successRejected: "Lead rejeitado. Notificação enviada ao candidato.",
    stats: {
      total: "Total de Leads",
      pending: "Pendentes de Revisão",
      approved: "Aprovados",
      rejected: "Rejeitados",
    },
    accessDenied: "Acesso Negado",
    accessDeniedMessage: "Você não tem permissão para acessar esta página. Apenas o pessoal da Franqueadora pode gerenciar leads de franquia.",
    returnHome: "Voltar ao Início",
    loadingPermissions: "Carregando permissões...",
  },
};

export default function FranchisorLeadManagement() {
  const { language } = useLanguage();
  const t = translations[language] || translations.en;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isFranchisor, isLoading: personaLoading } = usePersona();
  const [, setLocation] = useLocation();
  
  const [selectedLead, setSelectedLead] = useState<FranchiseLead | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  const { data: leads = [], isLoading } = useQuery<FranchiseLead[]>({
    queryKey: ["/api/franchise-leads"],
    enabled: isFranchisor,
  });

  // Show loading spinner while checking permissions
  if (personaLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{t.loadingPermissions}</p>
      </div>
    );
  }

  // Redirect non-franchisor users
  if (!isFranchisor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <ShieldAlert className="w-16 h-16 text-red-500" />
            </div>
            <CardTitle className="text-xl text-red-600">{t.accessDenied}</CardTitle>
            <CardDescription>
              {t.accessDeniedMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              {t.returnHome}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const approveMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return await apiRequest<{ success: boolean }>("/api/franchise-leads/approve", "POST", { leadId });
    },
    onSuccess: () => {
      toast({ title: t.successApproved });
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-leads"] });
      setShowApproveDialog(false);
      setSelectedLead(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ leadId, reason }: { leadId: string; reason: string }) => {
      return await apiRequest<{ success: boolean }>("/api/franchise-leads/reject", "POST", { leadId, reason });
    },
    onSuccess: () => {
      toast({ title: t.successRejected });
      queryClient.invalidateQueries({ queryKey: ["/api/franchise-leads"] });
      setShowRejectDialog(false);
      setSelectedLead(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      searchQuery === "" ||
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.franchise_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTab =
      activeTab === "all" ||
      lead.status === activeTab;

    return matchesSearch && matchesTab;
  });

  const stats = {
    total: leads.length,
    pending: leads.filter((l) => l.status === "pending").length,
    approved: leads.filter((l) => l.status === "approved").length,
    rejected: leads.filter((l) => l.status === "rejected").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="w-3 h-3 mr-1" />{t.pending}</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="w-3 h-3 mr-1" />{t.approved}</Badge>;
      case "rejected":
        return <Badge variant="outline" className="text-red-600 border-red-600"><XCircle className="w-3 h-3 mr-1" />{t.rejected}</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">{t.title}</h1>
        <p className="text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.total}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.pending}</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-stat-pending">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.approved}</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-stat-approved">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.stats.rejected}</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-stat-rejected">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">{t.all}</TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-pending">{t.pending}</TabsTrigger>
                <TabsTrigger value="approved" data-testid="tab-approved">{t.approved}</TabsTrigger>
                <TabsTrigger value="rejected" data-testid="tab-rejected">{t.rejected}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-leads">
              {t.noLeads}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.franchiseCode}</TableHead>
                  <TableHead>{t.name}</TableHead>
                  <TableHead>{t.email}</TableHead>
                  <TableHead>{t.city}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{t.submittedAt}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                    <TableCell className="font-mono text-sm">{lead.franchise_code}</TableCell>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>{lead.email}</TableCell>
                    <TableCell>{lead.address_city || "-"}</TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
                    <TableCell>{format(new Date(lead.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedLead(lead);
                          setShowDetails(true);
                        }}
                        data-testid={`button-view-${lead.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {lead.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowApproveDialog(true);
                            }}
                            data-testid={`button-approve-${lead.id}`}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowRejectDialog(true);
                            }}
                            data-testid={`button-reject-${lead.id}`}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {t.leadDetails}
            </DialogTitle>
            <DialogDescription>
              {selectedLead?.franchise_code}
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedLead.status)}
                <span className="text-sm text-muted-foreground">
                  {t.submittedAt}: {format(new Date(selectedLead.created_at), "dd/MM/yyyy HH:mm")}
                </span>
              </div>

              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" />
                  {t.personalInfo}
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t.name}:</span>
                    <p className="font-medium">{selectedLead.name}</p>
                  </div>
                  {selectedLead.trade_name && (
                    <div>
                      <span className="text-muted-foreground">{t.tradeName}:</span>
                      <p className="font-medium">{selectedLead.trade_name}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">{t.document}:</span>
                    <p className="font-medium">{selectedLead.document_type.toUpperCase()}: {selectedLead.document_number}</p>
                  </div>
                  {selectedLead.secondary_document && (
                    <div>
                      <span className="text-muted-foreground">{t.secondaryDocument}:</span>
                      <p className="font-medium">{selectedLead.secondary_document}</p>
                    </div>
                  )}
                  {selectedLead.birth_date && (
                    <div>
                      <span className="text-muted-foreground">{t.birthDate}:</span>
                      <p className="font-medium">{format(new Date(selectedLead.birth_date), "dd/MM/yyyy")}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" />
                  {t.contactInfo}
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t.email}:</span>
                    <p className="font-medium">{selectedLead.email}</p>
                  </div>
                  {selectedLead.phone && (
                    <div>
                      <span className="text-muted-foreground">{t.phone}:</span>
                      <p className="font-medium">{selectedLead.phone}</p>
                    </div>
                  )}
                  {selectedLead.whatsapp && (
                    <div>
                      <span className="text-muted-foreground">{t.whatsapp}:</span>
                      <p className="font-medium">{selectedLead.whatsapp}</p>
                    </div>
                  )}
                </div>
              </div>

              {(selectedLead.address_street || selectedLead.address_city || selectedLead.address_country) && (
                <div>
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4" />
                    {t.addressInfo}
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedLead.address_street && (
                      <div>
                        <span className="text-muted-foreground">{t.street}:</span>
                        <p className="font-medium">{selectedLead.address_street}</p>
                      </div>
                    )}
                    {selectedLead.address_number && (
                      <div>
                        <span className="text-muted-foreground">{t.number}:</span>
                        <p className="font-medium">{selectedLead.address_number}</p>
                      </div>
                    )}
                    {selectedLead.address_complement && (
                      <div>
                        <span className="text-muted-foreground">{t.complement}:</span>
                        <p className="font-medium">{selectedLead.address_complement}</p>
                      </div>
                    )}
                    {selectedLead.address_reference && (
                      <div>
                        <span className="text-muted-foreground">{t.reference}:</span>
                        <p className="font-medium">{selectedLead.address_reference}</p>
                      </div>
                    )}
                    {selectedLead.address_neighborhood && (
                      <div>
                        <span className="text-muted-foreground">{t.neighborhood}:</span>
                        <p className="font-medium">{selectedLead.address_neighborhood}</p>
                      </div>
                    )}
                    {selectedLead.address_zip && (
                      <div>
                        <span className="text-muted-foreground">{t.zipCode}:</span>
                        <p className="font-medium">{selectedLead.address_zip}</p>
                      </div>
                    )}
                    {selectedLead.address_city && (
                      <div>
                        <span className="text-muted-foreground">{t.city}:</span>
                        <p className="font-medium">{selectedLead.address_city}</p>
                      </div>
                    )}
                    {selectedLead.address_country && (
                      <div>
                        <span className="text-muted-foreground">{t.country}:</span>
                        <p className="font-medium">{selectedLead.address_country}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium flex items-center gap-2 mb-2">
                  <Paperclip className="w-4 h-4" />
                  {t.documents}
                </h4>
                {selectedLead.documents_urls && Array.isArray(selectedLead.documents_urls) && selectedLead.documents_urls.length > 0 ? (
                  <div className="space-y-2">
                    {(selectedLead.documents_urls as Array<{type: string; url: string; name: string}>).map((doc, index) => (
                      <div key={index} className="flex items-center justify-between bg-muted p-2 rounded text-sm">
                        <span className="truncate flex-1">{doc.name || `Document ${index + 1}`}</span>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline ml-2"
                          data-testid={`link-document-${index}`}
                        >
                          {t.viewDocument}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.noDocuments}</p>
                )}
              </div>

              {selectedLead.notes && (
                <div>
                  <h4 className="font-medium mb-2">{t.additionalNotes}</h4>
                  <p className="text-sm bg-muted p-3 rounded">{selectedLead.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedLead?.status === "pending" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="text-red-600 border-red-600"
                  onClick={() => {
                    setShowDetails(false);
                    setShowRejectDialog(true);
                  }}
                  data-testid="button-reject-from-details"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {t.reject}
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setShowDetails(false);
                    setShowApproveDialog(true);
                  }}
                  data-testid="button-approve-from-details"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t.approve}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-600">{t.approveConfirm}</DialogTitle>
            <DialogDescription>{t.approveMessage}</DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="py-4">
              <p className="font-medium">{selectedLead.name}</p>
              <p className="text-sm text-muted-foreground">{selectedLead.franchise_code}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)} data-testid="button-cancel-approve">
              {t.cancel}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => selectedLead && approveMutation.mutate(selectedLead.id)}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.approving}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t.confirm}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">{t.rejectConfirm}</DialogTitle>
            <DialogDescription>{t.rejectMessage}</DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="py-2">
                <p className="font-medium">{selectedLead.name}</p>
                <p className="text-sm text-muted-foreground">{selectedLead.franchise_code}</p>
              </div>
              <div>
                <label className="text-sm font-medium">{t.rejectionReason}</label>
                <Textarea
                  placeholder={t.rejectionPlaceholder}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  data-testid="input-rejection-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} data-testid="button-cancel-reject">
              {t.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedLead && rejectMutation.mutate({ leadId: selectedLead.id, reason: rejectionReason })}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.rejecting}
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  {t.confirm}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
