import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePersona } from "@/hooks/usePersona";
import { useState } from "react";
import { 
  Database,
  Brain,
  CreditCard,
  TrendingUp,
  Wifi,
  Twitter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Crown,
  History,
  Power,
  PowerOff,
  Clock
} from "lucide-react";

interface ExternalService {
  id: string;
  service_key: string;
  service_name: string;
  description: string;
  category: string;
  is_enabled: boolean;
  criticality: string;
  disabled_message: string;
  last_changed_by: string | null;
  last_changed_at: string | null;
  change_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditLogEntry {
  id: string;
  service_key: string;
  previous_state: boolean;
  new_state: boolean;
  changed_by: string | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, any> = {
  data: Database,
  ai: Brain,
  payment: CreditCard,
  trading: TrendingUp,
  social: Twitter,
};

const CATEGORY_COLORS: Record<string, string> = {
  data: "text-blue-600",
  ai: "text-purple-600",
  payment: "text-green-600",
  trading: "text-orange-600",
  social: "text-sky-600",
};

const CRITICALITY_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
  critical: { variant: "destructive", label: "Critical" },
  important: { variant: "default", label: "Important" },
  optional: { variant: "secondary", label: "Optional" },
};

function AccessDenied() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center h-full p-8">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-4" />
          <CardTitle>{t('accessDenied.title') || 'Access Denied'}</CardTitle>
          <CardDescription>{t('accessDenied.message') || 'You do not have permission to access this page.'}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function FranchisorExternalServices() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { persona, isLoading: personaLoading, isFranchisor } = usePersona();
  
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    service: ExternalService | null;
    newState: boolean;
  }>({ open: false, service: null, newState: false });
  
  const [reason, setReason] = useState("");
  const [showAuditLog, setShowAuditLog] = useState(false);

  const { data: servicesData, isLoading: servicesLoading } = useQuery<{ services: ExternalService[] }>({
    queryKey: ['/api/franchisor/external-services'],
    enabled: isFranchisor,
  });

  const { data: auditData } = useQuery<{ logs: AuditLogEntry[] }>({
    queryKey: ['/api/franchisor/external-services/audit-log'],
    enabled: showAuditLog && isFranchisor,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ serviceKey, enabled, reason }: { serviceKey: string; enabled: boolean; reason: string }) => {
      return apiRequest(`/api/franchisor/external-services/${serviceKey}`, 'PUT', { enabled, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/franchisor/external-services'] });
      queryClient.invalidateQueries({ queryKey: ['/api/franchisor/external-services/audit-log'] });
      toast({
        title: "Service Updated",
        description: "External service status has been changed successfully.",
      });
      setConfirmDialog({ open: false, service: null, newState: false });
      setReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update service status.",
        variant: "destructive",
      });
    },
  });

  if (personaLoading || servicesLoading) {
    return <LoadingSkeleton />;
  }

  if (!isFranchisor) {
    return <AccessDenied />;
  }

  const services = servicesData?.services || [];
  const auditLogs = auditData?.logs || [];

  const groupedServices: Record<string, ExternalService[]> = {};
  services.forEach(service => {
    if (!groupedServices[service.category]) {
      groupedServices[service.category] = [];
    }
    groupedServices[service.category].push(service);
  });

  const enabledCount = services.filter(s => s.is_enabled).length;
  const disabledCount = services.filter(s => !s.is_enabled).length;
  const criticalDisabled = services.filter(s => !s.is_enabled && s.criticality === 'critical').length;

  const handleToggleClick = (service: ExternalService, newState: boolean) => {
    if (!newState && service.criticality === 'critical') {
      setConfirmDialog({ open: true, service, newState });
    } else if (!newState) {
      setConfirmDialog({ open: true, service, newState });
    } else {
      toggleMutation.mutate({ serviceKey: service.service_key, enabled: newState, reason: "Enabled by franchisor" });
    }
  };

  const confirmToggle = () => {
    if (confirmDialog.service) {
      toggleMutation.mutate({
        serviceKey: confirmDialog.service.service_key,
        enabled: confirmDialog.newState,
        reason: reason || "No reason provided",
      });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-external-services-title">
            External Services Control
          </h1>
          <p className="text-muted-foreground">
            Manage external service connections to control operational costs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
            <Crown className="w-4 h-4 mr-1" />
            Franchisor Only
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAuditLog(!showAuditLog)}
            data-testid="button-toggle-audit-log"
          >
            <History className="w-4 h-4 mr-2" />
            Audit Log
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services Enabled</CardTitle>
            <Power className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-enabled-count">
              {enabledCount}
            </div>
            <p className="text-xs text-muted-foreground">Operating normally</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services Disabled</CardTitle>
            <PowerOff className="h-5 w-5 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600" data-testid="text-disabled-count">
              {disabledCount}
            </div>
            <p className="text-xs text-muted-foreground">Cost savings mode</p>
          </CardContent>
        </Card>

        <Card className={criticalDisabled > 0 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-background"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Services Off</CardTitle>
            <AlertTriangle className={`h-5 w-5 ${criticalDisabled > 0 ? 'text-red-600' : 'text-gray-400'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${criticalDisabled > 0 ? 'text-red-600' : 'text-gray-600'}`} data-testid="text-critical-disabled">
              {criticalDisabled}
            </div>
            <p className="text-xs text-muted-foreground">
              {criticalDisabled > 0 ? 'Requires attention!' : 'All critical services running'}
            </p>
          </CardContent>
        </Card>
      </div>

      {Object.entries(groupedServices).map(([category, categoryServices]) => {
        const CategoryIcon = CATEGORY_ICONS[category] || Database;
        const categoryColor = CATEGORY_COLORS[category] || "text-gray-600";
        
        return (
          <div key={category} className="space-y-4">
            <div className="flex items-center gap-2">
              <CategoryIcon className={`h-5 w-5 ${categoryColor}`} />
              <h2 className="text-lg font-semibold capitalize">{category}</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryServices.map((service) => {
                const criticalityBadge = CRITICALITY_BADGES[service.criticality] || CRITICALITY_BADGES.optional;
                
                return (
                  <Card 
                    key={service.id} 
                    className={`transition-all ${!service.is_enabled ? 'opacity-75 bg-muted/50' : ''}`}
                    data-testid={`card-service-${service.service_key}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            {service.is_enabled ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-400" />
                            )}
                            {service.service_name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant={criticalityBadge.variant}>
                              {criticalityBadge.label}
                            </Badge>
                          </div>
                        </div>
                        <Switch
                          checked={service.is_enabled}
                          onCheckedChange={(checked) => handleToggleClick(service, checked)}
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-${service.service_key}`}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <CardDescription className="text-sm">
                        {service.description}
                      </CardDescription>
                      
                      {!service.is_enabled && service.disabled_message && (
                        <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {service.disabled_message}
                          </p>
                        </div>
                      )}

                      {service.last_changed_at && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last changed: {formatDate(service.last_changed_at)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {showAuditLog && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Change History
            </CardTitle>
            <CardDescription>
              Recent changes to external service settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {auditLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No changes recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log, index) => (
                    <div key={log.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {log.new_state ? (
                              <Badge variant="default" className="bg-green-600">ENABLED</Badge>
                            ) : (
                              <Badge variant="secondary">DISABLED</Badge>
                            )}
                            <span className="font-medium">{log.service_key}</span>
                          </div>
                          {log.reason && (
                            <p className="text-sm text-muted-foreground">
                              Reason: {log.reason}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </span>
                      </div>
                      {index < auditLogs.length - 1 && <Separator className="my-3" />}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDialog.open} onOpenChange={(open) => {
        if (!open) {
          setConfirmDialog({ open: false, service: null, newState: false });
          setReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.service?.criticality === 'critical' && (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              Confirm Service Change
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.service?.criticality === 'critical' ? (
                <span className="text-red-600 font-medium">
                  Warning: This is a CRITICAL service. Disabling it may severely impact platform operations.
                </span>
              ) : (
                `You are about to ${confirmDialog.newState ? 'enable' : 'disable'} ${confirmDialog.service?.service_name}.`
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmDialog.service && !confirmDialog.newState && (
            <div className="space-y-4">
              <div className="p-3 rounded bg-muted">
                <p className="text-sm font-medium">Impact when disabled:</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {confirmDialog.service.disabled_message}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reason">Reason for change (required for audit)</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter reason for disabling this service..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="input-change-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialog({ open: false, service: null, newState: false });
                setReason("");
              }}
              data-testid="button-cancel-toggle"
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.service?.criticality === 'critical' ? 'destructive' : 'default'}
              onClick={confirmToggle}
              disabled={toggleMutation.isPending || (!confirmDialog.newState && !reason.trim())}
              data-testid="button-confirm-toggle"
            >
              {toggleMutation.isPending ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
